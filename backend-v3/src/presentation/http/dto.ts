/**
 * DTO mappers — the ONLY place bigints become display numbers. Shapes conform
 * to the frontend's presentational types (frontend/src/entities/campaign/types.ts
 * and entities/market/types.ts):
 *
 * - amounts are numbers in token units (formatUnits parity with the UI's toNum);
 * - `totalDeposited` = poolBalance + totalWithdrawn — the exact formula the UI
 *   derives from chain reads today, so wiring the API changes no displayed number
 *   (gross lifetime deposits are still tracked server-side, exposed as
 *   `lifetimeDeposited` for future product use);
 * - status: a campaign with no cohorts is "open", after the first deployment it
 *   is "returning" (V3 has no on-chain close);
 * - premarket orders include the full signed struct (strings, uint256-safe) so a
 *   taker can call fillOrder without another round-trip.
 */

import { formatUnits } from "viem";
import type { AccountCampaignPosition, CampaignView, CohortView } from "../../application/queries.js";
import type { ActivityEntry, CampaignMetadata, StoredOrder, TradeEntry } from "../../domain/types.js";
import { orderPrice } from "../../application/orders.js";
import { remainingShares } from "../../domain/order-rules.js";

export function makeDto(tokenDecimals: number) {
  const n = (x: bigint) => Number(formatUnits(x, tokenDecimals));

  const campaign = ({ campaign: c, metadata }: CampaignView) => ({
    address: c.address,
    name: metadata.name,
    description: metadata.description,
    ...(metadata.coverUrl ? { coverUrl: metadata.coverUrl } : {}),
    angel: { address: c.angel },
    status: c.currentCohort === 0 ? ("open" as const) : ("returning" as const),
    poolBalance: n(c.poolTotal),
    totalDeposited: n(c.poolTotal + c.totalShares),
    totalWithdrawn: n(c.totalShares),
    totalReturned: n(c.lifetimeReturned),
    cohortCount: c.currentCohort,
    believers: c.believers,
    createdAt: c.createdAt.toISOString(),
    lifetimeDeposited: n(c.lifetimeDeposited),
  });

  const cohort = (v: CohortView) => ({
    campaignAddress: v.cohort.campaign,
    index: v.cohort.cohortId,
    formedAt: v.cohort.formedAt.toISOString(),
    totalShares: n(v.cohort.totalShares),
    returned: n(v.cohort.returned),
    yourShares: n(v.yourShares),
    yourClaimable: n(v.yourClaimable),
  });

  const activity = (a: ActivityEntry) => ({
    id: a.id,
    type: a.type,
    actor: a.actor,
    amount: n(a.amount),
    ...(a.cohortId !== undefined ? { cohortIndex: a.cohortId } : {}),
    txHash: a.txHash,
    at: a.at.toISOString(),
    campaignAddress: a.campaign,
  });

  const order = (o: StoredOrder) => ({
    id: o.orderHash,
    campaignAddress: o.campaign,
    cohortIndex: Number(o.cohortId),
    side: o.isSell ? ("ask" as const) : ("bid" as const),
    price: orderPrice(o),
    size: n(o.shareAmount),
    filled: n(o.filledShares),
    remaining: n(remainingShares(o)),
    status: o.status,
    maker: o.maker,
    placedAt: o.createdAt.toISOString(),
    deadline: new Date(Number(o.deadline) * 1000).toISOString(),
    /** Everything a taker needs for CampaignV3.fillOrder(order, signature, fillShares). */
    fill: {
      order: {
        maker: o.maker,
        isSell: o.isSell,
        cohortId: o.cohortId.toString(),
        shareAmount: o.shareAmount.toString(),
        usdcAmount: o.usdcAmount.toString(),
        nonce: o.nonce.toString(),
        deadline: o.deadline.toString(),
      },
      signature: o.signature,
    },
  });

  const trade = (t: TradeEntry) => ({
    id: t.id,
    // aggressor view: the taker bought when the maker was selling
    side: t.makerIsSeller ? ("bid" as const) : ("ask" as const),
    price: Number(t.usdc) / Number(t.shares),
    size: n(t.shares),
    at: t.at.toISOString(),
    cohortIndex: t.cohortId,
    maker: t.maker,
    taker: t.taker,
    txHash: t.txHash,
  });

  const bookLevel = (l: { price: number; size: bigint }) => ({ price: l.price, size: n(l.size) });

  const position = (p: AccountCampaignPosition) => ({
    campaignAddress: p.campaign.address,
    campaignName: p.metadata.name,
    status: p.campaign.currentCohort === 0 ? ("open" as const) : ("returning" as const),
    refundable: n(p.refundable),
    accrued: n(p.accrued),
    totalClaimable: n(p.totalClaimable),
    cohorts: p.cohorts.map((c) => ({
      index: c.cohortId,
      shares: n(c.shares),
      claimable: n(c.claimable),
    })),
  });

  const metadata = (m: CampaignMetadata) => ({
    campaignAddress: m.campaign,
    name: m.name,
    description: m.description,
    ...(m.coverUrl ? { coverUrl: m.coverUrl } : {}),
    updatedAt: m.updatedAt.toISOString(),
  });

  return { campaign, cohort, activity, order, trade, bookLevel, position, metadata };
}

export type Dto = ReturnType<typeof makeDto>;
