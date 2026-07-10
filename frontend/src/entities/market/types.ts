/**
 * Premarket order-book model (per-cohort share trading).
 * Prices are in fundraising-token units per share.
 * TODO(onchain): map order-book contract state / indexer onto these shapes.
 */

export type OrderSide = "bid" | "ask";

export interface OrderLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  campaignAddress: `0x${string}`;
  cohortIndex: number;
  /** Sorted best-first: bids descending, asks ascending. */
  bids: OrderLevel[];
  asks: OrderLevel[];
  lastPrice?: number;
}

export interface OpenOrder {
  id: string;
  campaignAddress: `0x${string}`;
  campaignName: string;
  cohortIndex: number;
  side: OrderSide;
  price: number;
  size: number;
  filled: number;
  placedAt: string;
}

export interface MarketTrade {
  id: string;
  side: OrderSide;
  price: number;
  size: number;
  at: string;
}
