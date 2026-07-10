import type { MarketTrade, OpenOrder, OrderBook } from "./types";

/** TODO(onchain): delete once premarket contract reads are wired. */

const ATLAS = "0xa71a3ae1bbbd6d82e5b6f9c22f1c5da75c3bf2ad" as const;

export const MOCK_ORDER_BOOKS: OrderBook[] = [
  {
    campaignAddress: ATLAS,
    cohortIndex: 1,
    bids: [
      { price: 0.94, size: 1800 },
      { price: 0.91, size: 3500 },
      { price: 0.88, size: 6000 },
    ],
    asks: [
      { price: 0.99, size: 900 },
      { price: 1.02, size: 2200 },
      { price: 1.08, size: 4100 },
    ],
    lastPrice: 0.97,
  },
  {
    campaignAddress: ATLAS,
    cohortIndex: 2,
    bids: [
      { price: 0.99, size: 2500 },
      { price: 0.96, size: 1500 },
    ],
    asks: [
      { price: 1.04, size: 1200 },
      { price: 1.09, size: 3000 },
    ],
    lastPrice: 1.01,
  },
  {
    campaignAddress: ATLAS,
    cohortIndex: 3,
    bids: [
      { price: 1.02, size: 1200 },
      { price: 1.0, size: 2000 },
      { price: 0.97, size: 1800 },
      { price: 0.94, size: 4000 },
      { price: 0.9, size: 6500 },
    ],
    asks: [
      { price: 1.045, size: 800 },
      { price: 1.06, size: 1500 },
      { price: 1.08, size: 2400 },
      { price: 1.12, size: 5000 },
      { price: 1.18, size: 3200 },
    ],
    lastPrice: 1.03,
  },
];

export const MOCK_OPEN_ORDERS: OpenOrder[] = [
  {
    id: "o1",
    campaignAddress: ATLAS,
    campaignName: "Atlas Deep Compute",
    cohortIndex: 3,
    side: "bid",
    price: 1.01,
    size: 1500,
    filled: 0,
    placedAt: "2026-07-05T15:20:00Z",
  },
  {
    id: "o2",
    campaignAddress: ATLAS,
    campaignName: "Atlas Deep Compute",
    cohortIndex: 1,
    side: "ask",
    price: 1.1,
    size: 800,
    filled: 320,
    placedAt: "2026-07-02T10:05:00Z",
  },
];

export const MOCK_TRADES: MarketTrade[] = [
  { id: "t1", side: "bid", price: 1.03, size: 640, at: "2026-07-06T17:40:00Z" },
  { id: "t2", side: "ask", price: 1.02, size: 1200, at: "2026-07-06T14:12:00Z" },
  { id: "t3", side: "bid", price: 1.045, size: 300, at: "2026-07-05T22:51:00Z" },
  { id: "t4", side: "bid", price: 1.04, size: 2500, at: "2026-07-05T09:33:00Z" },
  { id: "t5", side: "ask", price: 1.0, size: 900, at: "2026-07-04T19:08:00Z" },
];

export function getOrderBook(campaignAddress: string, cohortIndex: number): OrderBook | undefined {
  return MOCK_ORDER_BOOKS.find(
    (b) =>
      b.campaignAddress.toLowerCase() === campaignAddress.toLowerCase() &&
      b.cohortIndex === cohortIndex
  );
}
