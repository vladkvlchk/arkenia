/**
 * Domain model — pure types, no infrastructure imports.
 * All money/share quantities are raw on-chain integers (bigint, token base units).
 * Conversion to display numbers happens only at the presentation edge.
 */

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** Normalized on-chain event, ordered by (blockNumber, logIndex). */
export interface ChainEventBase {
  chainId: number;
  blockNumber: bigint;
  blockTime: Date;
  txHash: Hex;
  logIndex: number;
}

export type ChainEvent = ChainEventBase &
  (
    | { name: "CampaignCreated"; campaign: Address; angel: Address; token: Address }
    | { name: "Deposited"; campaign: Address; believer: Address; amount: bigint }
    | { name: "Refunded"; campaign: Address; believer: Address; amount: bigint }
    | { name: "Withdrawn"; campaign: Address; cohortId: bigint; amount: bigint; fractionRay: bigint }
    | { name: "FundsReturned"; campaign: Address; cohortId: bigint; amount: bigint }
    | { name: "FundsReturnedToAll"; campaign: Address; amount: bigint }
    | { name: "Claimed"; campaign: Address; believer: Address; amount: bigint }
    | { name: "Settled"; campaign: Address; user: Address; uptoCohort: bigint }
    | {
        name: "SharesTransferred";
        campaign: Address;
        cohortId: bigint;
        from: Address;
        to: Address;
        amount: bigint;
      }
    | {
        name: "OrderFilled";
        campaign: Address;
        orderHash: Hex;
        maker: Address;
        taker: Address;
        cohortId: bigint;
        shares: bigint;
        usdc: bigint;
        makerIsSeller: boolean;
      }
    | { name: "OrderCancelled"; campaign: Address; orderHash: Hex; maker: Address }
    | { name: "OrdersInvalidated"; campaign: Address; maker: Address; minValidNonce: bigint }
  );

export type ChainEventName = ChainEvent["name"];

/** Mirror of a campaign's global accounting state. */
export interface CampaignState {
  address: Address;
  chainId: number;
  angel: Address;
  token: Address;
  createdAt: Date;
  createdBlock: bigint;
  /** Refundable pool (contract `poolTotal`). */
  poolTotal: bigint;
  /** Lifetime deployed == Σ cohort share supplies (contract `totalShares`). */
  totalShares: bigint;
  /** Contract `globalAccRay` — uniform per-share reward accumulator. */
  globalAccRay: bigint;
  /** Contract `rewardReserves` — returned but unclaimed USDC. */
  rewardReserves: bigint;
  currentCohort: number;
  /** Σ Deposited (gross, includes later-refunded capital). */
  lifetimeDeposited: bigint;
  /** Σ FundsReturned + FundsReturnedToAll. */
  lifetimeReturned: bigint;
  /** Accounts currently holding pool balance or cohort shares. */
  believers: number;
}

export interface CohortState {
  campaign: Address;
  /** 1-based, matches on-chain cohortId. */
  cohortId: number;
  fractionRay: bigint;
  totalShares: bigint;
  /** Contract `cohortAccRay[n]` — targeted per-share accumulator. */
  accRay: bigint;
  /** Contract `globalAccAtBirthRay[n]`. */
  globalAccAtBirthRay: bigint;
  /** Lifetime USDC attributed to this cohort (targeted + uniform since birth). */
  returned: bigint;
  formedAt: Date;
  formedBlock: bigint;
  formedTx: Hex;
}

/** Mirror of a believer's per-campaign pool accounting (contract `_poolBalance` / `settledUpTo`). */
export interface PositionState {
  campaign: Address;
  account: Address;
  /** Raw un-settled pool balance mirror. */
  poolBalance: bigint;
  settledUpTo: number;
  /** Realised, unclaimed reward (contract `_accruedReward`). */
  accruedReward: bigint;
}

/** Mirror of `_cohortShares[n][user]` + `_rewardDebt[n][user]`. */
export interface ShareState {
  campaign: Address;
  cohortId: number;
  account: Address;
  shares: bigint;
  rewardDebt: bigint;
}

/** Activity types the UI understands (frontend entities/campaign/types.ts). */
export type ActivityType = "deposit" | "withdraw" | "return" | "claim" | "refund";

export interface ActivityEntry {
  /** `${txHash}-${logIndex}` — stable, idempotent id. */
  id: string;
  campaign: Address;
  type: ActivityType;
  actor: Address;
  amount: bigint;
  cohortId?: number;
  txHash: Hex;
  at: Date;
}

/** A signed premarket order as submitted to the order store (intent only — never funds). */
export interface OrderIntent {
  maker: Address;
  isSell: boolean;
  cohortId: bigint;
  shareAmount: bigint;
  usdcAmount: bigint;
  nonce: bigint;
  deadline: bigint;
}

export type OrderStatus = "open" | "filled" | "cancelled" | "invalidated";

export interface StoredOrder extends OrderIntent {
  orderHash: Hex;
  campaign: Address;
  signature: Hex;
  status: OrderStatus;
  filledShares: bigint;
  createdAt: Date;
}

export interface TradeEntry {
  id: string;
  campaign: Address;
  cohortId: number;
  orderHash: Hex;
  maker: Address;
  taker: Address;
  shares: bigint;
  usdc: bigint;
  makerIsSeller: boolean;
  txHash: Hex;
  at: Date;
}

export interface CampaignMetadata {
  campaign: Address;
  name: string;
  description: string;
  coverUrl?: string;
  updatedAt: Date;
}
