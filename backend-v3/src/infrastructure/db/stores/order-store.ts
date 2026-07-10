import { and, desc, eq } from "drizzle-orm";
import type { OrderStore } from "../../../application/ports.js";
import type { Address, Hex, StoredOrder, TradeEntry } from "../../../domain/types.js";
import type { DbHandle } from "../client.js";
import * as t from "../schema.js";

type OrderRow = typeof t.orders.$inferSelect;

export function rowToOrder(row: OrderRow): StoredOrder {
  return {
    orderHash: row.orderHash as Hex,
    campaign: row.campaign as Address,
    maker: row.maker as Address,
    isSell: row.isSell,
    cohortId: BigInt(row.cohortId),
    shareAmount: row.shareAmount,
    usdcAmount: row.usdcAmount,
    nonce: row.nonce,
    deadline: row.deadline,
    signature: row.signature as Hex,
    status: row.status as StoredOrder["status"],
    filledShares: row.filledShares,
    createdAt: row.createdAt,
  };
}

export class DrizzleOrderStore implements OrderStore {
  constructor(private readonly db: DbHandle) {}

  async insertOrder(order: StoredOrder): Promise<void> {
    await this.db.insert(t.orders).values({
      campaign: order.campaign,
      orderHash: order.orderHash,
      maker: order.maker,
      isSell: order.isSell,
      cohortId: Number(order.cohortId),
      shareAmount: order.shareAmount,
      usdcAmount: order.usdcAmount,
      nonce: order.nonce,
      deadline: order.deadline,
      signature: order.signature,
      status: order.status,
      filledShares: order.filledShares,
      createdAt: order.createdAt,
    });
  }

  async hasOrder(campaign: Address, orderHash: Hex): Promise<boolean> {
    const rows = await this.db
      .select({ orderHash: t.orders.orderHash })
      .from(t.orders)
      .where(and(eq(t.orders.campaign, campaign), eq(t.orders.orderHash, orderHash)))
      .limit(1);
    return rows.length > 0;
  }

  async listOpenOrders(campaign: Address, cohortId?: number): Promise<StoredOrder[]> {
    const where =
      cohortId !== undefined
        ? and(
            eq(t.orders.campaign, campaign),
            eq(t.orders.status, "open"),
            eq(t.orders.cohortId, cohortId)
          )
        : and(eq(t.orders.campaign, campaign), eq(t.orders.status, "open"));
    const rows = await this.db.select().from(t.orders).where(where).orderBy(desc(t.orders.createdAt));
    return rows.map(rowToOrder);
  }

  async listOpenNonces(campaign: Address, maker: Address): Promise<bigint[]> {
    const rows = await this.db
      .select({ nonce: t.orders.nonce })
      .from(t.orders)
      .where(
        and(eq(t.orders.campaign, campaign), eq(t.orders.maker, maker), eq(t.orders.status, "open"))
      );
    return rows.map((r) => r.nonce);
  }

  async getMinValidNonce(campaign: Address, maker: Address): Promise<bigint> {
    const rows = await this.db
      .select({ minValidNonce: t.makerNonces.minValidNonce })
      .from(t.makerNonces)
      .where(and(eq(t.makerNonces.campaign, campaign), eq(t.makerNonces.maker, maker)));
    return rows[0]?.minValidNonce ?? 0n;
  }

  async listTrades(campaign: Address, cohortId: number | undefined, limit: number): Promise<TradeEntry[]> {
    const where =
      cohortId !== undefined
        ? and(eq(t.trades.campaign, campaign), eq(t.trades.cohortId, cohortId))
        : eq(t.trades.campaign, campaign);
    const rows = await this.db
      .select()
      .from(t.trades)
      .where(where)
      .orderBy(desc(t.trades.at))
      .limit(limit);
    return rows.map((r) => ({
      ...r,
      campaign: r.campaign as Address,
      orderHash: r.orderHash as Hex,
      maker: r.maker as Address,
      taker: r.taker as Address,
      txHash: r.txHash as Hex,
    }));
  }
}
