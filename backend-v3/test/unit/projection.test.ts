/**
 * The projection math against hand-computed contract scenarios.
 * RAY = 1e27; amounts in 6-decimal base units.
 */

import { describe, expect, it } from "vitest";
import { RAY } from "../../src/domain/constants.js";
import {
  applyFundsReturned,
  applyFundsReturnedToAll,
  applyWithdrawn,
  claim,
  cohortSharesOf,
  pendingReward,
  pendingRewardOf,
  refundableOf,
  settle,
  transferShares,
} from "../../src/domain/projection.js";
import type { CampaignState, CohortState, PositionState, ShareState } from "../../src/domain/types.js";

const USDC = 10n ** 6n;
const A = "0x00000000000000000000000000000000000000aa" as const;
const CAMPAIGN = "0x00000000000000000000000000000000000000cc" as const;

const position = (over: Partial<PositionState> = {}): PositionState => ({
  campaign: CAMPAIGN,
  account: A,
  poolBalance: 0n,
  settledUpTo: 0,
  accruedReward: 0n,
  ...over,
});

const share = (over: Partial<ShareState> = {}): ShareState => ({
  campaign: CAMPAIGN,
  cohortId: 1,
  account: A,
  shares: 0n,
  rewardDebt: 0n,
  ...over,
});

const campaign = (over: Partial<CampaignState> = {}): CampaignState => ({
  address: CAMPAIGN,
  chainId: 31337,
  angel: A,
  token: A,
  createdAt: new Date(0),
  createdBlock: 1n,
  poolTotal: 0n,
  totalShares: 0n,
  globalAccRay: 0n,
  rewardReserves: 0n,
  currentCohort: 0,
  lifetimeDeposited: 0n,
  lifetimeReturned: 0n,
  believers: 0,
  ...over,
});

const cohortRef = (cohortId: number, fractionRay: bigint, birth = 0n) => ({
  cohortId,
  fractionRay,
  globalAccAtBirthRay: birth,
});

describe("settle", () => {
  it("converts the exact contract fraction with flooring", () => {
    // pool 1000, cohort takes 10% → conv 100, remainder 900
    const result = settle(position({ poolBalance: 1000n * USDC }), [cohortRef(1, RAY / 10n)], 1);
    expect(result.conversions).toEqual([{ cohortId: 1, shares: 100n * USDC, rewardDebt: 0n }]);
    expect(result.poolBalance).toBe(900n * USDC);
    expect(result.settledUpTo).toBe(1);
  });

  it("floors sub-unit conversions to zero and keeps the balance", () => {
    // bal 5 base units × 10% → 0.5 → floors to 0; nothing converts
    const result = settle(position({ poolBalance: 5n }), [cohortRef(1, RAY / 10n)], 1);
    expect(result.conversions).toEqual([]);
    expect(result.poolBalance).toBe(5n);
    expect(result.settledUpTo).toBe(1);
  });

  it("chains conversions across several cohorts", () => {
    // 10% then 50%: 1000 → c1 100, bal 900 → c2 450, bal 450
    const result = settle(
      position({ poolBalance: 1000n * USDC }),
      [cohortRef(1, RAY / 10n), cohortRef(2, RAY / 2n)],
      2
    );
    expect(result.conversions).toEqual([
      { cohortId: 1, shares: 100n * USDC, rewardDebt: 0n },
      { cohortId: 2, shares: 450n * USDC, rewardDebt: 0n },
    ]);
    expect(result.poolBalance).toBe(450n * USDC);
  });

  it("jumps a zero balance straight to the emitted checkpoint", () => {
    const result = settle(position({ poolBalance: 0n }), [cohortRef(1, RAY / 10n)], 3);
    expect(result.conversions).toEqual([]);
    expect(result.settledUpTo).toBe(3);
  });

  it("records reward debt at the cohort's birth accumulator", () => {
    // cohort born after a global return of 5e26/RAY per share
    const birth = RAY / 2n; // 0.5 per share
    const result = settle(position({ poolBalance: 100n * USDC }), [cohortRef(1, RAY / 10n, birth)], 1);
    expect(result.conversions).toEqual([
      { cohortId: 1, shares: 10n * USDC, rewardDebt: 5n * USDC }, // 10 shares × 0.5
    ]);
  });

  it("is a no-op when already settled to the checkpoint", () => {
    const p = position({ poolBalance: 100n, settledUpTo: 2 });
    const result = settle(p, [cohortRef(1, RAY / 10n), cohortRef(2, RAY / 10n)], 2);
    expect(result.conversions).toEqual([]);
    expect(result.poolBalance).toBe(100n);
  });
});

describe("rewards", () => {
  it("pendingReward mirrors realize math", () => {
    const s = share({ shares: 100n * USDC, rewardDebt: 0n });
    // acc 0.1 per share → 10
    expect(pendingReward(s, RAY / 10n, 0n)).toBe(10n * USDC);
    // debt swallows it
    expect(pendingReward(share({ shares: 100n * USDC, rewardDebt: 10n * USDC }), RAY / 10n, 0n)).toBe(0n);
  });

  it("transferShares realizes both parties then resyncs debt (contract example)", () => {
    // c1: 400 total shares, 40 returned → acc = 0.1/share. A holds 100 (debt 10 after claim).
    const acc = RAY / 10n;
    const from = share({ shares: 100n * USDC, rewardDebt: 10n * USDC });
    const to = share({ account: "0x00000000000000000000000000000000000000cd", shares: 0n });
    const moved = transferShares(from, to, 40n * USDC, acc, 0n);

    expect(moved.from.shares).toBe(60n * USDC);
    expect(moved.from.rewardDebt).toBe(6n * USDC);
    expect(moved.from.accruedDelta).toBe(0n); // fully claimed before
    expect(moved.to.shares).toBe(40n * USDC);
    expect(moved.to.rewardDebt).toBe(4n * USDC);

    // next 40 return doubles acc → A pending 6, C pending 4 (15% / 10% of 40)
    const acc2 = acc * 2n;
    expect(pendingReward({ ...from, ...moved.from }, acc2, 0n)).toBe(6n * USDC);
    expect(pendingReward({ ...to, ...moved.to }, acc2, 0n)).toBe(4n * USDC);
  });

  it("claim realizes every cohort, pays out, flags drift on over-claim", () => {
    const acc = new Map([[1, RAY / 10n]]);
    const s = share({ shares: 100n * USDC });
    const ok = claim(position(), [s], acc, 0n, 10n * USDC);
    expect(ok.accruedReward).toBe(0n);
    expect(ok.drift).toBe(false);
    expect(ok.updates).toEqual([{ cohortId: 1, rewardDebt: 10n * USDC }]);

    const bad = claim(position(), [s], acc, 0n, 11n * USDC);
    expect(bad.drift).toBe(true);
    expect(bad.accruedReward).toBe(0n);
  });
});

describe("campaign aggregates", () => {
  it("withdraw mints a cohort at the campaign's current global accumulator", () => {
    const c = campaign({ poolTotal: 4000n * USDC, globalAccRay: 123n });
    const { campaign: next, cohort } = applyWithdrawn(c, {
      cohortId: 1,
      amount: 400n * USDC,
      fractionRay: RAY / 10n,
      at: new Date(1000),
      block: 3n,
      tx: "0x01",
    });
    expect(next.poolTotal).toBe(3600n * USDC);
    expect(next.totalShares).toBe(400n * USDC);
    expect(next.currentCohort).toBe(1);
    expect(cohort.totalShares).toBe(400n * USDC);
    expect(cohort.globalAccAtBirthRay).toBe(123n);
  });

  it("targeted return bumps the cohort accumulator by amount/shares", () => {
    const c = campaign({ totalShares: 400n * USDC });
    const cohort: CohortState = {
      campaign: CAMPAIGN,
      cohortId: 1,
      fractionRay: RAY / 10n,
      totalShares: 400n * USDC,
      accRay: 0n,
      globalAccAtBirthRay: 0n,
      returned: 0n,
      formedAt: new Date(0),
      formedBlock: 1n,
      formedTx: "0x01",
    };
    const result = applyFundsReturned(c, cohort, 40n * USDC);
    expect(result.cohort.accRay).toBe(RAY / 10n);
    expect(result.cohort.returned).toBe(40n * USDC);
    expect(result.campaign.rewardReserves).toBe(40n * USDC);
    expect(result.campaign.lifetimeReturned).toBe(40n * USDC);
  });

  it("uniform return attributes exact per-cohort payouts", () => {
    const c = campaign({ totalShares: 400n * USDC });
    const c1: CohortState = {
      campaign: CAMPAIGN, cohortId: 1, fractionRay: 0n, totalShares: 100n * USDC,
      accRay: 0n, globalAccAtBirthRay: 0n, returned: 0n,
      formedAt: new Date(0), formedBlock: 1n, formedTx: "0x01",
    };
    const c2: CohortState = { ...c1, cohortId: 2, totalShares: 300n * USDC };
    const result = applyFundsReturnedToAll(c, [c1, c2], 40n * USDC);
    expect(result.campaign.globalAccRay).toBe(RAY / 10n);
    expect(result.cohorts[0]!.returned).toBe(10n * USDC); // 100/400 of 40
    expect(result.cohorts[1]!.returned).toBe(30n * USDC); // 300/400 of 40
  });
});

describe("read-time views (lazy settlement aware)", () => {
  // A deposited 1000; c1 took 10% (global return of 0.5/share happened before c2's birth);
  // c2 took 10% of the rest. A has NOT settled.
  const refs = [cohortRef(1, RAY / 10n), cohortRef(2, RAY / 10n, RAY / 2n)];
  const p = position({ poolBalance: 1000n * USDC });

  it("cohortSharesOf materialises pending conversions without mutating", () => {
    expect(cohortSharesOf(p, 0n, refs, 1)).toBe(100n * USDC);
    expect(cohortSharesOf(p, 0n, refs, 2)).toBe(90n * USDC); // 10% of 900
  });

  it("refundableOf runs the conversion chain and clamps to poolTotal", () => {
    expect(refundableOf(p, refs, 2, 10_000n * USDC)).toBe(810n * USDC);
    expect(refundableOf(p, refs, 2, 500n * USDC)).toBe(500n * USDC); // clamp
  });

  it("pendingRewardOf uses birth-acc debt for unsettled cohorts (contract view parity)", () => {
    // global acc now 0.5/share; c2 was born at 0.5 → no pending for c2
    const c2 = { cohortId: 2, accRay: 0n, globalAccAtBirthRay: RAY / 2n };
    expect(pendingRewardOf(p, undefined, refs, c2, RAY / 2n)).toBe(0n);
    // c1 born at 0 → 100 shares × 0.5 = 50 pending
    const c1 = { cohortId: 1, accRay: 0n, globalAccAtBirthRay: 0n };
    expect(pendingRewardOf(p, undefined, refs, c1, RAY / 2n)).toBe(50n * USDC);
  });
});
