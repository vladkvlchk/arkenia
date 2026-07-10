/**
 * Pure projection math — an exact off-chain replay of CampaignV3's accounting.
 *
 * The contract settles believers LAZILY: a withdrawal stores one fraction f_n and
 * every believer's cohort shares materialise the next time the contract touches
 * them (`_settle` → `Settled` event). This module replays that math with the same
 * integer flooring (bigint division == Solidity division for non-negatives), so
 * the DB mirror stays bit-exact with on-chain state.
 *
 * Everything here is pure: (state, event) → new state. No I/O, no infra imports.
 * The application layer loads state, calls these, persists results.
 */

import { RAY } from "./constants.js";
import type { CampaignState, CohortState, PositionState, ShareState } from "./types.js";

/** fraction lookup for settle loops: cohortId → fractionRay/birth acc. */
export interface CohortRef {
  cohortId: number;
  fractionRay: bigint;
  globalAccAtBirthRay: bigint;
}

export interface SettleResult {
  poolBalance: bigint;
  settledUpTo: number;
  /** Per-cohort share/debt increments to apply (only cohorts with conv > 0). */
  conversions: { cohortId: number; shares: bigint; rewardDebt: bigint }[];
}

/**
 * Replay of `settleTo(user, uptoCohort)` given the cohorts in (settledUpTo, uptoCohort].
 * `cohorts` MUST be sorted ascending and cover exactly that range.
 *
 * Mirrors the contract precisely, including the bal == 0 jump (the emitted
 * `uptoCohort` already reflects the jump target, so a uniform loop is exact —
 * conversions after bal hits 0 are all zero).
 */
export function settle(position: PositionState, cohorts: CohortRef[], uptoCohort: number): SettleResult {
  const conversions: SettleResult["conversions"] = [];
  let bal = position.poolBalance;
  if (position.settledUpTo >= uptoCohort) {
    return { poolBalance: bal, settledUpTo: position.settledUpTo, conversions };
  }
  if (bal > 0n) {
    for (const c of cohorts) {
      if (c.cohortId <= position.settledUpTo || c.cohortId > uptoCohort) continue;
      const conv = (bal * c.fractionRay) / RAY;
      if (conv !== 0n) {
        conversions.push({
          cohortId: c.cohortId,
          shares: conv,
          rewardDebt: (conv * c.globalAccAtBirthRay) / RAY,
        });
        bal -= conv;
      }
      if (bal === 0n) break;
    }
  }
  return { poolBalance: bal, settledUpTo: uptoCohort, conversions };
}

/** `_realizeReward`: pending = shares × (cohortAcc + globalAcc)/RAY − debt, floored at 0. */
export function pendingReward(share: ShareState, cohortAccRay: bigint, globalAccRay: bigint): bigint {
  const earned = (share.shares * (cohortAccRay + globalAccRay)) / RAY;
  return earned > share.rewardDebt ? earned - share.rewardDebt : 0n;
}

/** `_resyncDebt`: debt := shares × (cohortAcc + globalAcc)/RAY. */
export function syncedDebt(shares: bigint, cohortAccRay: bigint, globalAccRay: bigint): bigint {
  return (shares * (cohortAccRay + globalAccRay)) / RAY;
}

export interface TransferSharesResult {
  from: { shares: bigint; rewardDebt: bigint; accruedDelta: bigint };
  to: { shares: bigint; rewardDebt: bigint; accruedDelta: bigint };
}

/**
 * Replay of `_moveShares` AFTER both parties' `Settled` events have been applied
 * (they precede `SharesTransferred` in the same tx): realize both, move, resync both.
 */
export function transferShares(
  from: ShareState,
  to: ShareState,
  amount: bigint,
  cohortAccRay: bigint,
  globalAccRay: bigint
): TransferSharesResult {
  const fromAccrued = pendingReward(from, cohortAccRay, globalAccRay);
  const toAccrued = pendingReward(to, cohortAccRay, globalAccRay);
  const fromShares = from.shares - amount;
  const toShares = to.shares + amount;
  if (fromShares < 0n) throw new Error(`transferShares: negative balance for ${from.account}`);
  return {
    from: {
      shares: fromShares,
      rewardDebt: syncedDebt(fromShares, cohortAccRay, globalAccRay),
      accruedDelta: fromAccrued,
    },
    to: {
      shares: toShares,
      rewardDebt: syncedDebt(toShares, cohortAccRay, globalAccRay),
      accruedDelta: toAccrued,
    },
  };
}

export interface ClaimResult {
  /** New accrued after realizing every cohort and paying out `amount`. */
  accruedReward: bigint;
  /** Realized-to-accrued per cohort → each share row's debt resyncs. */
  updates: { cohortId: number; rewardDebt: bigint }[];
  /** True when the mirror had less accrued than the contract paid — signals drift. */
  drift: boolean;
}

/**
 * Replay of `claim(cohortIds)`. The event doesn't say WHICH cohorts were realized,
 * so we realize + resync ALL of the user's share rows. That is safe: realize/resync
 * only moves value from "pending" to "accrued" without changing the invariant
 *   totalClaimable(user) = accrued + Σ pending(n)
 * so over-realizing keeps every reported number identical.
 */
export function claim(
  position: PositionState,
  shares: ShareState[],
  cohortAcc: Map<number, bigint>,
  globalAccRay: bigint,
  paidAmount: bigint
): ClaimResult {
  let accrued = position.accruedReward;
  const updates: ClaimResult["updates"] = [];
  for (const s of shares) {
    const acc = cohortAcc.get(s.cohortId) ?? 0n;
    accrued += pendingReward(s, acc, globalAccRay);
    updates.push({ cohortId: s.cohortId, rewardDebt: syncedDebt(s.shares, acc, globalAccRay) });
  }
  const drift = paidAmount > accrued;
  return { accruedReward: drift ? 0n : accrued - paidAmount, updates, drift };
}

/** Replay of `withdraw`: mint cohort n, decrement pool. Returns the new cohort row. */
export function applyWithdrawn(
  campaign: CampaignState,
  args: { cohortId: number; amount: bigint; fractionRay: bigint; at: Date; block: bigint; tx: `0x${string}` }
): { campaign: CampaignState; cohort: CohortState } {
  return {
    campaign: {
      ...campaign,
      poolTotal: campaign.poolTotal - args.amount,
      totalShares: campaign.totalShares + args.amount,
      currentCohort: Math.max(campaign.currentCohort, args.cohortId),
    },
    cohort: {
      campaign: campaign.address,
      cohortId: args.cohortId,
      fractionRay: args.fractionRay,
      totalShares: args.amount,
      accRay: 0n,
      globalAccAtBirthRay: campaign.globalAccRay,
      returned: 0n,
      formedAt: args.at,
      formedBlock: args.block,
      formedTx: args.tx,
    },
  };
}

/** Replay of `returnFunds(amount, cohortId)`. */
export function applyFundsReturned(
  campaign: CampaignState,
  cohort: CohortState,
  amount: bigint
): { campaign: CampaignState; cohort: CohortState } {
  return {
    campaign: {
      ...campaign,
      rewardReserves: campaign.rewardReserves + amount,
      lifetimeReturned: campaign.lifetimeReturned + amount,
    },
    cohort: {
      ...cohort,
      accRay: cohort.accRay + (amount * RAY) / cohort.totalShares,
      returned: cohort.returned + amount,
    },
  };
}

/**
 * Replay of `returnFundsToAll(amount)`: bumps the global accumulator and attributes
 * the exact per-cohort payout (totalShares_n × ΔaccRay / RAY) to each cohort's
 * lifetime `returned` — the same flooring the contract pays out with.
 */
export function applyFundsReturnedToAll(
  campaign: CampaignState,
  cohorts: CohortState[],
  amount: bigint
): { campaign: CampaignState; cohorts: CohortState[] } {
  const deltaRay = (amount * RAY) / campaign.totalShares;
  return {
    campaign: {
      ...campaign,
      globalAccRay: campaign.globalAccRay + deltaRay,
      rewardReserves: campaign.rewardReserves + amount,
      lifetimeReturned: campaign.lifetimeReturned + amount,
    },
    cohorts: cohorts.map((c) => ({
      ...c,
      returned: c.returned + (c.totalShares * deltaRay) / RAY,
    })),
  };
}

// ─────────────────────────── read-time views ───────────────────────────

/** Replay of the `refundableOf(user)` view (includes the poolTotal clamp). */
export function refundableOf(
  position: PositionState,
  cohortsAfterCheckpoint: CohortRef[],
  currentCohort: number,
  poolTotal: bigint
): bigint {
  let bal = position.poolBalance;
  if (bal === 0n) return 0n;
  for (const c of cohortsAfterCheckpoint) {
    if (c.cohortId <= position.settledUpTo || c.cohortId > currentCohort) continue;
    bal -= (bal * c.fractionRay) / RAY;
    if (bal === 0n) break;
  }
  return bal > poolTotal ? poolTotal : bal;
}

/**
 * Replay of the `pendingRewardOf(user, [n])` per-cohort term (WITHOUT the user's
 * accrued bucket — report that once, not once per cohort).
 */
export function pendingRewardOf(
  position: PositionState,
  materialised: ShareState | undefined,
  cohortsUpToN: CohortRef[],
  cohort: { cohortId: number; accRay: bigint; globalAccAtBirthRay: bigint },
  globalAccRay: bigint
): bigint {
  const shares = cohortSharesOf(
    position,
    materialised?.shares ?? 0n,
    cohortsUpToN,
    cohort.cohortId
  );
  if (shares === 0n) return 0n;
  const accrued = (shares * (cohort.accRay + globalAccRay)) / RAY;
  const debt =
    cohort.cohortId <= position.settledUpTo
      ? (materialised?.rewardDebt ?? 0n)
      : (shares * cohort.globalAccAtBirthRay) / RAY;
  return accrued > debt ? accrued - debt : 0n;
}

/** Replay of `cohortSharesOf(user, n)`: materialised + not-yet-settled conversion. */
export function cohortSharesOf(
  position: PositionState,
  materialised: bigint,
  cohortsUpToN: CohortRef[],
  n: number
): bigint {
  if (n <= position.settledUpTo) return materialised;
  let bal = position.poolBalance;
  let target = 0n;
  for (const c of cohortsUpToN) {
    if (c.cohortId <= position.settledUpTo || c.cohortId > n) continue;
    const conv = (bal * c.fractionRay) / RAY;
    if (c.cohortId === n) {
      target = conv;
      break;
    }
    bal -= conv;
  }
  return materialised + target;
}
