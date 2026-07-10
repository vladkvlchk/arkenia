/**
 * Presentational domain model for CampaignV3 (pool → cohorts → returns).
 * Amounts are display numbers in token units.
 * TODO(onchain): map indexer/contract reads onto these shapes.
 */

export type CampaignStatus = "open" | "returning" | "closed";

export interface AccountRef {
  address: `0x${string}`;
  /** Optional human name (e.g. a basename). Address stays the source of truth. */
  label?: string;
}

export interface Campaign {
  address: `0x${string}`;
  name: string;
  description: string;
  angel: AccountRef;
  status: CampaignStatus;
  /** Refundable, un-deployed deposits currently in the pool. */
  poolBalance: number;
  /** Lifetime deposits. */
  totalDeposited: number;
  /** Capital deployed by the angel = sum of cohort share supplies. */
  totalWithdrawn: number;
  /** Profit returned to cohorts so far. */
  totalReturned: number;
  cohortCount: number;
  believers: number;
  createdAt: string;
  coverUrl?: string;
}

export interface Cohort {
  campaignAddress: `0x${string}`;
  /** 1-based display index — "Cohort #3". */
  index: number;
  formedAt: string;
  /** Share supply == token amount withdrawn when the cohort was minted. */
  totalShares: number;
  /** Total returned to this cohort so far. */
  returned: number;
  /** Viewer's holdings; 0 when not a member. */
  yourShares: number;
  /** Viewer's unclaimed rewards in this cohort. */
  yourClaimable: number;
}

export type ActivityType = "deposit" | "withdraw" | "return" | "claim" | "refund";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  actor: `0x${string}`;
  amount: number;
  /** Present for cohort-scoped events (withdraw mints, returns, claims). */
  cohortIndex?: number;
  txHash: `0x${string}`;
  at: string;
}
