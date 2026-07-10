/**
 * ChainSync — the indexer use case. Pulls confirmed logs in bounded ranges,
 * projects them through the pure domain math, and persists atomically:
 * one batch == one DB transaction == events + aggregates + cursor.
 *
 * Idempotent: every event is keyed by (chainId, txHash, logIndex); a replayed
 * batch inserts nothing and re-applies nothing. Re-orgs are absorbed by only
 * indexing blocks at least `confirmations` behind the head; deeper re-orgs are
 * handled operationally (`npm run reindex` rebuilds from the deploy block).
 */

import {
  applyFundsReturned,
  applyFundsReturnedToAll,
  applyWithdrawn,
  claim,
  settle,
  transferShares,
} from "../domain/projection.js";
import type {
  ActivityEntry,
  Address,
  CampaignState,
  ChainEvent,
  PositionState,
  ShareState,
} from "../domain/types.js";
import type { ChainSource, Logger, ProjectionStore, ProjectionUnitOfWork } from "./ports.js";

export interface ChainSyncConfig {
  chainId: number;
  factoryAddress: Address;
  /** Blocks to stay behind the head (re-org buffer). */
  confirmations: number;
  /** Max blocks per getLogs range / per transaction. */
  blockRange: number;
  /** Optional explicit start (factory deploy block); discovered on-chain when absent. */
  startBlock?: bigint;
}

export interface BatchResult {
  fromBlock: bigint;
  toBlock: bigint;
  events: number;
  newCampaigns: number;
}

export class ChainSync {
  constructor(
    private readonly chain: ChainSource,
    private readonly uow: ProjectionUnitOfWork,
    private readonly cfg: ChainSyncConfig,
    private readonly log: Logger
  ) {}

  /** Process at most one block range. Returns null when already at head. */
  async runOnce(): Promise<BatchResult | null> {
    const head = (await this.chain.getHead()) - BigInt(this.cfg.confirmations);
    const cursor = await this.uow.withTransaction((s) => s.getCursor(this.cfg.chainId));
    const from = cursor !== null ? cursor + 1n : await this.startBlock();
    if (from > head) return null;

    const to = from + BigInt(this.cfg.blockRange - 1) > head ? head : from + BigInt(this.cfg.blockRange - 1);

    const factoryEvents = await this.chain.getFactoryEvents(from, to);
    const known = await this.uow.withTransaction((s) => s.listCampaignAddresses(this.cfg.chainId));
    const created = factoryEvents.filter((e) => e.name === "CampaignCreated");
    const addresses = [
      ...new Set([...known, ...created.map((e) => (e as ChainEvent & { campaign: Address }).campaign)]),
    ];
    const campaignEvents = addresses.length > 0 ? await this.chain.getCampaignEvents(addresses, from, to) : [];

    const events = [...factoryEvents, ...campaignEvents].sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
      return a.logIndex - b.logIndex;
    });

    let applied = 0;
    await this.uow.withTransaction(async (store) => {
      for (const event of events) {
        const fresh = await store.insertEventOnce(event);
        if (!fresh) continue;
        await this.apply(store, event);
        applied++;
      }
      await store.setCursor(this.cfg.chainId, to);
    });

    return { fromBlock: from, toBlock: to, events: applied, newCampaigns: created.length };
  }

  /** Poll forever (pm2 worker entrypoint). */
  async runLoop(pollIntervalMs: number, signal?: AbortSignal): Promise<void> {
    while (!signal?.aborted) {
      try {
        const batch = await this.runOnce();
        if (batch) {
          if (batch.events > 0 || batch.newCampaigns > 0) {
            this.log.info(
              { from: batch.fromBlock.toString(), to: batch.toBlock.toString(), events: batch.events },
              "indexed batch"
            );
          }
          if (batch.events === 0 && batch.newCampaigns === 0) continue; // drain quiet ranges fast
          continue; // more ranges may be pending — loop immediately
        }
      } catch (err) {
        this.log.error({ err }, "indexer batch failed; retrying after interval");
      }
      await sleep(pollIntervalMs, signal);
    }
  }

  private async startBlock(): Promise<bigint> {
    if (this.cfg.startBlock !== undefined) return this.cfg.startBlock;
    const block = await this.chain.findFactoryDeployBlock();
    this.log.info({ block: block.toString() }, "discovered factory deploy block");
    return block;
  }

  // ─────────────────────────── event application ───────────────────────────

  private async apply(store: ProjectionStore, event: ChainEvent): Promise<void> {
    switch (event.name) {
      case "CampaignCreated":
        return this.onCampaignCreated(store, event);
      case "Deposited":
        return this.onDeposited(store, event);
      case "Refunded":
        return this.onRefunded(store, event);
      case "Withdrawn":
        return this.onWithdrawn(store, event);
      case "FundsReturned":
        return this.onFundsReturned(store, event);
      case "FundsReturnedToAll":
        return this.onFundsReturnedToAll(store, event);
      case "Settled":
        return this.onSettled(store, event);
      case "SharesTransferred":
        return this.onSharesTransferred(store, event);
      case "Claimed":
        return this.onClaimed(store, event);
      case "OrderFilled":
        return this.onOrderFilled(store, event);
      case "OrderCancelled":
        return store.updateOrderStatus(event.campaign, event.orderHash, "cancelled");
      case "OrdersInvalidated":
        await store.setMinValidNonce(event.campaign, event.maker, event.minValidNonce);
        return store.invalidateOpenOrdersBelow(event.campaign, event.maker, event.minValidNonce);
    }
  }

  private async onCampaignCreated(
    store: ProjectionStore,
    e: Extract<ChainEvent, { name: "CampaignCreated" }>
  ): Promise<void> {
    const existing = await store.getCampaign(e.campaign);
    if (existing) return;
    await store.upsertCampaign({
      address: e.campaign,
      chainId: this.cfg.chainId,
      angel: e.angel,
      token: e.token,
      createdAt: e.blockTime,
      createdBlock: e.blockNumber,
      poolTotal: 0n,
      totalShares: 0n,
      globalAccRay: 0n,
      rewardReserves: 0n,
      currentCohort: 0,
      lifetimeDeposited: 0n,
      lifetimeReturned: 0n,
      believers: 0,
    });
  }

  private async onDeposited(store: ProjectionStore, e: Extract<ChainEvent, { name: "Deposited" }>) {
    const campaign = await this.mustCampaign(store, e.campaign);
    const position = await this.positionOf(store, e.campaign, e.believer);
    const wasActive = await store.hasActiveHoldings(e.campaign, e.believer);

    position.poolBalance += e.amount;
    await store.upsertPosition(position);

    campaign.poolTotal += e.amount;
    campaign.lifetimeDeposited += e.amount;
    if (!wasActive) campaign.believers += 1;
    await store.upsertCampaign(campaign);

    await store.insertActivity(activity(e, "deposit", e.believer, e.amount));
  }

  private async onRefunded(store: ProjectionStore, e: Extract<ChainEvent, { name: "Refunded" }>) {
    const campaign = await this.mustCampaign(store, e.campaign);
    const position = await this.positionOf(store, e.campaign, e.believer);

    if (position.poolBalance < e.amount) {
      this.log.warn({ event: e.txHash, account: e.believer }, "refund exceeds mirrored balance — clamping");
      position.poolBalance = 0n;
    } else {
      position.poolBalance -= e.amount;
    }
    await store.upsertPosition(position);

    campaign.poolTotal -= e.amount;
    const stillActive = await store.hasActiveHoldings(e.campaign, e.believer);
    if (!stillActive && campaign.believers > 0) campaign.believers -= 1;
    await store.upsertCampaign(campaign);

    await store.insertActivity(activity(e, "refund", e.believer, e.amount));
  }

  private async onWithdrawn(store: ProjectionStore, e: Extract<ChainEvent, { name: "Withdrawn" }>) {
    const campaign = await this.mustCampaign(store, e.campaign);
    const result = applyWithdrawn(campaign, {
      cohortId: Number(e.cohortId),
      amount: e.amount,
      fractionRay: e.fractionRay,
      at: e.blockTime,
      block: e.blockNumber,
      tx: e.txHash,
    });
    await store.upsertCohort(result.cohort);
    await store.upsertCampaign(result.campaign);
    await store.insertActivity(activity(e, "withdraw", campaign.angel, e.amount, Number(e.cohortId)));
  }

  private async onFundsReturned(store: ProjectionStore, e: Extract<ChainEvent, { name: "FundsReturned" }>) {
    const campaign = await this.mustCampaign(store, e.campaign);
    const cohort = await store.getCohort(e.campaign, Number(e.cohortId));
    if (!cohort) throw new Error(`FundsReturned for unknown cohort ${e.cohortId} @ ${e.campaign}`);
    const result = applyFundsReturned(campaign, cohort, e.amount);
    await store.upsertCohort(result.cohort);
    await store.upsertCampaign(result.campaign);
    await store.insertActivity(activity(e, "return", campaign.angel, e.amount, Number(e.cohortId)));
  }

  private async onFundsReturnedToAll(
    store: ProjectionStore,
    e: Extract<ChainEvent, { name: "FundsReturnedToAll" }>
  ) {
    const campaign = await this.mustCampaign(store, e.campaign);
    const cohorts = await store.listCohorts(e.campaign);
    const result = applyFundsReturnedToAll(campaign, cohorts, e.amount);
    for (const cohort of result.cohorts) await store.upsertCohort(cohort);
    await store.upsertCampaign(result.campaign);
    await store.insertActivity(activity(e, "return", campaign.angel, e.amount));
  }

  private async onSettled(store: ProjectionStore, e: Extract<ChainEvent, { name: "Settled" }>) {
    const position = await this.positionOf(store, e.campaign, e.user);
    const cohorts = await store.listCohorts(e.campaign);
    const result = settle(position, cohorts, Number(e.uptoCohort));

    for (const conv of result.conversions) {
      const share = await this.shareOf(store, e.campaign, conv.cohortId, e.user);
      share.shares += conv.shares;
      share.rewardDebt += conv.rewardDebt;
      await store.upsertShare(share);
    }
    position.poolBalance = result.poolBalance;
    position.settledUpTo = result.settledUpTo;
    await store.upsertPosition(position);
  }

  private async onSharesTransferred(
    store: ProjectionStore,
    e: Extract<ChainEvent, { name: "SharesTransferred" }>
  ) {
    const campaign = await this.mustCampaign(store, e.campaign);
    const cohort = await store.getCohort(e.campaign, Number(e.cohortId));
    if (!cohort) throw new Error(`SharesTransferred for unknown cohort ${e.cohortId} @ ${e.campaign}`);

    const toWasActive = await store.hasActiveHoldings(e.campaign, e.to);

    const fromShare = await this.shareOf(store, e.campaign, cohort.cohortId, e.from);
    const toShare = await this.shareOf(store, e.campaign, cohort.cohortId, e.to);
    const moved = transferShares(fromShare, toShare, e.amount, cohort.accRay, campaign.globalAccRay);

    fromShare.shares = moved.from.shares;
    fromShare.rewardDebt = moved.from.rewardDebt;
    toShare.shares = moved.to.shares;
    toShare.rewardDebt = moved.to.rewardDebt;
    await store.upsertShare(fromShare);
    await store.upsertShare(toShare);

    if (moved.from.accruedDelta > 0n) {
      const p = await this.positionOf(store, e.campaign, e.from);
      p.accruedReward += moved.from.accruedDelta;
      await store.upsertPosition(p);
    }
    if (moved.to.accruedDelta > 0n) {
      const p = await this.positionOf(store, e.campaign, e.to);
      p.accruedReward += moved.to.accruedDelta;
      await store.upsertPosition(p);
    }

    let believersDelta = 0;
    if (!toWasActive) believersDelta += 1; // receiving shares always activates
    if (!(await store.hasActiveHoldings(e.campaign, e.from))) believersDelta -= 1;
    if (believersDelta !== 0) {
      campaign.believers = Math.max(0, campaign.believers + believersDelta);
      await store.upsertCampaign(campaign);
    }
  }

  private async onClaimed(store: ProjectionStore, e: Extract<ChainEvent, { name: "Claimed" }>) {
    const campaign = await this.mustCampaign(store, e.campaign);
    const position = await this.positionOf(store, e.campaign, e.believer);
    const shares = await store.listSharesForAccount(e.campaign, e.believer);
    const cohorts = await store.listCohorts(e.campaign);
    const accByCohort = new Map(cohorts.map((c) => [c.cohortId, c.accRay]));

    const result = claim(position, shares, accByCohort, campaign.globalAccRay, e.amount);
    if (result.drift) {
      this.log.warn({ tx: e.txHash, account: e.believer }, "claim exceeds mirrored accrual — clamping");
    }
    position.accruedReward = result.accruedReward;
    await store.upsertPosition(position);

    for (const u of result.updates) {
      const share = shares.find((s) => s.cohortId === u.cohortId);
      if (!share) continue;
      share.rewardDebt = u.rewardDebt;
      await store.upsertShare(share);
    }

    campaign.rewardReserves = campaign.rewardReserves >= e.amount ? campaign.rewardReserves - e.amount : 0n;
    await store.upsertCampaign(campaign);

    await store.insertActivity(activity(e, "claim", e.believer, e.amount));
  }

  private async onOrderFilled(store: ProjectionStore, e: Extract<ChainEvent, { name: "OrderFilled" }>) {
    await store.insertTrade({
      id: `${e.txHash}-${e.logIndex}`,
      campaign: e.campaign,
      cohortId: Number(e.cohortId),
      orderHash: e.orderHash,
      maker: e.maker,
      taker: e.taker,
      shares: e.shares,
      usdc: e.usdc,
      makerIsSeller: e.makerIsSeller,
      txHash: e.txHash,
      at: e.blockTime,
    });
    const order = await store.getOrderByHash(e.campaign, e.orderHash);
    if (!order) return; // filled an order that was never posted to this book — trade recorded anyway
    const filled = order.filledShares + e.shares;
    const status = filled >= order.shareAmount ? "filled" : order.status;
    await store.updateOrderFill(e.campaign, e.orderHash, filled, status);
  }

  // ─────────────────────────── helpers ───────────────────────────

  private async mustCampaign(store: ProjectionStore, address: Address): Promise<CampaignState> {
    const campaign = await store.getCampaign(address);
    if (!campaign) throw new Error(`event for unindexed campaign ${address}`);
    return campaign;
  }

  private async positionOf(store: ProjectionStore, campaign: Address, account: Address): Promise<PositionState> {
    return (
      (await store.getPosition(campaign, account)) ?? {
        campaign,
        account,
        poolBalance: 0n,
        settledUpTo: 0,
        accruedReward: 0n,
      }
    );
  }

  private async shareOf(
    store: ProjectionStore,
    campaign: Address,
    cohortId: number,
    account: Address
  ): Promise<ShareState> {
    return (
      (await store.getShare(campaign, cohortId, account)) ?? {
        campaign,
        cohortId,
        account,
        shares: 0n,
        rewardDebt: 0n,
      }
    );
  }
}

function activity(
  e: ChainEvent,
  type: ActivityEntry["type"],
  actor: Address,
  amount: bigint,
  cohortId?: number
): ActivityEntry {
  return {
    id: `${e.txHash}-${e.logIndex}`,
    campaign: (e as ChainEvent & { campaign: Address }).campaign,
    type,
    actor,
    amount,
    ...(cohortId !== undefined ? { cohortId } : {}),
    txHash: e.txHash,
    at: e.blockTime,
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}
