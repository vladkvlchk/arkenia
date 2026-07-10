/**
 * ProjectionStore over Drizzle — the indexer's write side. All rows are
 * upserted by primary key so replays are naturally idempotent; the event
 * journal insert is the idempotency gate for aggregate mutations.
 */

import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import type { ProjectionStore, ProjectionUnitOfWork } from "../../../application/ports.js";
import type {
  ActivityEntry,
  Address,
  CampaignState,
  ChainEvent,
  CohortState,
  Hex,
  PositionState,
  ShareState,
  StoredOrder,
  TradeEntry,
} from "../../../domain/types.js";
import type { DbHandle } from "../client.js";
import * as t from "../schema.js";
import { rowToOrder } from "./order-store.js";

export class DrizzleProjectionStore implements ProjectionStore {
  constructor(private readonly db: DbHandle) {}

  async getCursor(chainId: number): Promise<bigint | null> {
    const rows = await this.db.select().from(t.indexerCursor).where(eq(t.indexerCursor.chainId, chainId));
    return rows[0]?.lastBlock ?? null;
  }

  async setCursor(chainId: number, block: bigint): Promise<void> {
    await this.db
      .insert(t.indexerCursor)
      .values({ chainId, lastBlock: block, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: t.indexerCursor.chainId,
        set: { lastBlock: block, updatedAt: new Date() },
      });
  }

  async insertEventOnce(event: ChainEvent): Promise<boolean> {
    const { chainId, blockNumber, blockTime, txHash, logIndex, name, ...rest } = event;
    const inserted = await this.db
      .insert(t.chainEvents)
      .values({
        chainId,
        txHash,
        logIndex,
        campaign: (rest as { campaign: Address }).campaign,
        eventName: name,
        blockNumber,
        blockTime,
        args: JSON.parse(
          JSON.stringify(rest, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v))
        ) as object,
      })
      .onConflictDoNothing()
      .returning({ txHash: t.chainEvents.txHash });
    return inserted.length > 0;
  }

  async getCampaign(address: Address): Promise<CampaignState | null> {
    const rows = await this.db.select().from(t.campaigns).where(eq(t.campaigns.address, address));
    const r = rows[0];
    return r ? { ...r, address: r.address as Address, angel: r.angel as Address, token: r.token as Address } : null;
  }

  async upsertCampaign(c: CampaignState): Promise<void> {
    const { address, ...rest } = c;
    await this.db
      .insert(t.campaigns)
      .values({ address, ...rest })
      .onConflictDoUpdate({ target: t.campaigns.address, set: rest });
  }

  async listCampaignAddresses(chainId: number): Promise<Address[]> {
    const rows = await this.db
      .select({ address: t.campaigns.address })
      .from(t.campaigns)
      .where(eq(t.campaigns.chainId, chainId));
    return rows.map((r) => r.address as Address);
  }

  async getCohort(campaign: Address, cohortId: number): Promise<CohortState | null> {
    const rows = await this.db
      .select()
      .from(t.cohorts)
      .where(and(eq(t.cohorts.campaign, campaign), eq(t.cohorts.cohortId, cohortId)));
    return (rows[0] as CohortState | undefined) ?? null;
  }

  async listCohorts(campaign: Address): Promise<CohortState[]> {
    const rows = await this.db
      .select()
      .from(t.cohorts)
      .where(eq(t.cohorts.campaign, campaign))
      .orderBy(asc(t.cohorts.cohortId));
    return rows as CohortState[];
  }

  async upsertCohort(c: CohortState): Promise<void> {
    const { campaign, cohortId, ...rest } = c;
    await this.db
      .insert(t.cohorts)
      .values({ campaign, cohortId, ...rest })
      .onConflictDoUpdate({ target: [t.cohorts.campaign, t.cohorts.cohortId], set: rest });
  }

  async getPosition(campaign: Address, account: Address): Promise<PositionState | null> {
    const rows = await this.db
      .select()
      .from(t.positions)
      .where(and(eq(t.positions.campaign, campaign), eq(t.positions.account, account)));
    return (rows[0] as PositionState | undefined) ?? null;
  }

  async upsertPosition(p: PositionState): Promise<void> {
    const { campaign, account, ...rest } = p;
    await this.db
      .insert(t.positions)
      .values({ campaign, account, ...rest })
      .onConflictDoUpdate({ target: [t.positions.campaign, t.positions.account], set: rest });
  }

  async getShare(campaign: Address, cohortId: number, account: Address): Promise<ShareState | null> {
    const rows = await this.db
      .select()
      .from(t.shares)
      .where(
        and(eq(t.shares.campaign, campaign), eq(t.shares.cohortId, cohortId), eq(t.shares.account, account))
      );
    return (rows[0] as ShareState | undefined) ?? null;
  }

  async listSharesForAccount(campaign: Address, account: Address): Promise<ShareState[]> {
    const rows = await this.db
      .select()
      .from(t.shares)
      .where(and(eq(t.shares.campaign, campaign), eq(t.shares.account, account)))
      .orderBy(asc(t.shares.cohortId));
    return rows as ShareState[];
  }

  async upsertShare(s: ShareState): Promise<void> {
    const { campaign, cohortId, account, ...rest } = s;
    await this.db
      .insert(t.shares)
      .values({ campaign, cohortId, account, ...rest })
      .onConflictDoUpdate({
        target: [t.shares.campaign, t.shares.cohortId, t.shares.account],
        set: rest,
      });
  }

  async hasActiveHoldings(campaign: Address, account: Address): Promise<boolean> {
    const pool = await this.db
      .select({ poolBalance: t.positions.poolBalance })
      .from(t.positions)
      .where(and(eq(t.positions.campaign, campaign), eq(t.positions.account, account)));
    if ((pool[0]?.poolBalance ?? 0n) > 0n) return true;
    const share = await this.db
      .select({ shares: t.shares.shares })
      .from(t.shares)
      .where(
        and(eq(t.shares.campaign, campaign), eq(t.shares.account, account), gt(t.shares.shares, 0n))
      )
      .limit(1);
    return share.length > 0;
  }

  async insertActivity(entry: ActivityEntry): Promise<void> {
    await this.db
      .insert(t.activity)
      .values({ ...entry, cohortId: entry.cohortId ?? null })
      .onConflictDoNothing();
  }

  async getOrderByHash(campaign: Address, orderHash: Hex): Promise<StoredOrder | null> {
    const rows = await this.db
      .select()
      .from(t.orders)
      .where(and(eq(t.orders.campaign, campaign), eq(t.orders.orderHash, orderHash)));
    return rows[0] ? rowToOrder(rows[0]) : null;
  }

  async updateOrderFill(
    campaign: Address,
    orderHash: Hex,
    filledShares: bigint,
    status: StoredOrder["status"]
  ): Promise<void> {
    await this.db
      .update(t.orders)
      .set({ filledShares, status })
      .where(and(eq(t.orders.campaign, campaign), eq(t.orders.orderHash, orderHash)));
  }

  async updateOrderStatus(campaign: Address, orderHash: Hex, status: StoredOrder["status"]): Promise<void> {
    await this.db
      .update(t.orders)
      .set({ status })
      .where(and(eq(t.orders.campaign, campaign), eq(t.orders.orderHash, orderHash)));
  }

  async setMinValidNonce(campaign: Address, maker: Address, nonce: bigint): Promise<void> {
    await this.db
      .insert(t.makerNonces)
      .values({ campaign, maker, minValidNonce: nonce })
      .onConflictDoUpdate({
        target: [t.makerNonces.campaign, t.makerNonces.maker],
        set: { minValidNonce: sql`GREATEST(${t.makerNonces.minValidNonce}, ${nonce.toString()}::numeric)` },
      });
  }

  async invalidateOpenOrdersBelow(campaign: Address, maker: Address, nonce: bigint): Promise<void> {
    await this.db
      .update(t.orders)
      .set({ status: "invalidated" })
      .where(
        and(
          eq(t.orders.campaign, campaign),
          eq(t.orders.maker, maker),
          eq(t.orders.status, "open"),
          lt(t.orders.nonce, nonce)
        )
      );
  }

  async insertTrade(trade: TradeEntry): Promise<void> {
    await this.db.insert(t.trades).values(trade).onConflictDoNothing();
  }
}

/** One batch == one transaction (drizzle tx handles are DbHandle-compatible). */
export class DrizzleUnitOfWork implements ProjectionUnitOfWork {
  constructor(private readonly db: DbHandle) {}

  withTransaction<T>(fn: (store: ProjectionStore) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new DrizzleProjectionStore(tx)));
  }
}
