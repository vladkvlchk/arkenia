/**
 * Premarket order store use cases. Signed intents only — this service never
 * touches funds; settlement is `fillOrder` on-chain, indexed back via events.
 */

import { DomainError } from "../domain/errors.js";
import { assertCanonicalSignature, assertSubmittable, isLive, remainingShares } from "../domain/order-rules.js";
import type { Address, Hex, OrderIntent, StoredOrder, TradeEntry } from "../domain/types.js";
import type { CampaignQueryStore, OrderSignatureVerifier, OrderStore } from "./ports.js";

export interface SubmitOrderInput {
  campaign: Address;
  order: OrderIntent;
  signature: Hex;
}

export class SubmitOrder {
  constructor(
    private readonly campaigns: CampaignQueryStore,
    private readonly orders: OrderStore,
    private readonly verifier: OrderSignatureVerifier
  ) {}

  async execute(input: SubmitOrderInput): Promise<StoredOrder> {
    const campaign = await this.campaigns.getCampaign(input.campaign);
    if (!campaign) throw new DomainError("unknown_campaign", `campaign ${input.campaign} is not indexed`);

    assertCanonicalSignature(input.signature);

    const orderHash = this.verifier.hashOrder(input.campaign, input.order);
    const signatureOk = await this.verifier.verifyOrder(input.campaign, input.order, input.signature);
    if (!signatureOk) {
      throw new DomainError("invalid_signature", "signature does not recover to the maker");
    }

    const [minValidNonce, openNonces, duplicate] = await Promise.all([
      this.orders.getMinValidNonce(input.campaign, input.order.maker),
      this.orders.listOpenNonces(input.campaign, input.order.maker),
      this.orders.hasOrder(input.campaign, orderHash),
    ]);
    assertSubmittable(input.order, orderHash, {
      currentCohort: campaign.currentCohort,
      minValidNonce,
      existingOrderHashes: duplicate ? new Set([orderHash.toLowerCase()]) : new Set(),
      openNoncesForMaker: new Set(openNonces),
      now: new Date(),
    });

    const stored: StoredOrder = {
      ...input.order,
      orderHash,
      campaign: input.campaign,
      signature: input.signature,
      status: "open",
      filledShares: 0n,
      createdAt: new Date(),
    };
    await this.orders.insertOrder(stored);
    return stored;
  }
}

export interface BookLevel {
  price: number;
  size: bigint;
}

export interface OrderBookView {
  campaign: Address;
  cohortId?: number;
  bids: BookLevel[];
  asks: BookLevel[];
  lastPrice?: number;
  orders: StoredOrder[];
  trades: TradeEntry[];
}

/** Price per share as a plain ratio — both legs share the token's 6 decimals. */
export function orderPrice(order: { usdcAmount: bigint; shareAmount: bigint }): number {
  return Number(order.usdcAmount) / Number(order.shareAmount);
}

export class GetOrderBook {
  constructor(
    private readonly campaigns: CampaignQueryStore,
    private readonly orders: OrderStore
  ) {}

  async execute(campaign: Address, cohortId?: number): Promise<OrderBookView> {
    const exists = await this.campaigns.getCampaign(campaign);
    if (!exists) throw new DomainError("unknown_campaign", `campaign ${campaign} is not indexed`);

    const now = new Date();
    const open = (await this.orders.listOpenOrders(campaign, cohortId)).filter((o) => isLive(o, now));
    const trades = await this.orders.listTrades(campaign, cohortId, 50);

    const levels = (side: boolean) => {
      const byPrice = new Map<number, bigint>();
      for (const order of open) {
        if (order.isSell !== side) continue;
        const price = orderPrice(order);
        byPrice.set(price, (byPrice.get(price) ?? 0n) + remainingShares(order));
      }
      return [...byPrice.entries()].map(([price, size]) => ({ price, size }));
    };

    const asks = levels(true).sort((a, b) => a.price - b.price);
    const bids = levels(false).sort((a, b) => b.price - a.price);
    const last = trades[0];

    return {
      campaign,
      ...(cohortId !== undefined ? { cohortId } : {}),
      bids,
      asks,
      ...(last ? { lastPrice: Number(last.usdc) / Number(last.shares) } : {}),
      orders: open,
      trades,
    };
  }
}
