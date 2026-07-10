/**
 * Application ports — every dependency the use cases need, expressed as
 * interfaces. Infrastructure implements these; domain knows none of them.
 */

import type {
  ActivityEntry,
  Address,
  CampaignMetadata,
  CampaignState,
  ChainEvent,
  CohortState,
  Hex,
  OrderIntent,
  PositionState,
  ShareState,
  StoredOrder,
  TradeEntry,
} from "../domain/types.js";

// ─────────────────────────── projection (indexer writes) ───────────────────────────

export interface ProjectionStore {
  getCursor(chainId: number): Promise<bigint | null>;
  setCursor(chainId: number, block: bigint): Promise<void>;

  /** Insert the raw event exactly once. Returns false when already indexed (idempotent replay). */
  insertEventOnce(event: ChainEvent): Promise<boolean>;

  getCampaign(address: Address): Promise<CampaignState | null>;
  upsertCampaign(campaign: CampaignState): Promise<void>;
  listCampaignAddresses(chainId: number): Promise<Address[]>;

  getCohort(campaign: Address, cohortId: number): Promise<CohortState | null>;
  /** Sorted ascending by cohortId. */
  listCohorts(campaign: Address): Promise<CohortState[]>;
  upsertCohort(cohort: CohortState): Promise<void>;

  getPosition(campaign: Address, account: Address): Promise<PositionState | null>;
  upsertPosition(position: PositionState): Promise<void>;

  getShare(campaign: Address, cohortId: number, account: Address): Promise<ShareState | null>;
  listSharesForAccount(campaign: Address, account: Address): Promise<ShareState[]>;
  upsertShare(share: ShareState): Promise<void>;

  /** poolBalance > 0 OR any cohort shares > 0 — believer liveness check. */
  hasActiveHoldings(campaign: Address, account: Address): Promise<boolean>;

  insertActivity(entry: ActivityEntry): Promise<void>;

  // premarket projections (fills / cancels / bulk invalidation)
  getOrderByHash(campaign: Address, orderHash: Hex): Promise<StoredOrder | null>;
  updateOrderFill(campaign: Address, orderHash: Hex, filledShares: bigint, status: StoredOrder["status"]): Promise<void>;
  updateOrderStatus(campaign: Address, orderHash: Hex, status: StoredOrder["status"]): Promise<void>;
  setMinValidNonce(campaign: Address, maker: Address, nonce: bigint): Promise<void>;
  invalidateOpenOrdersBelow(campaign: Address, maker: Address, nonce: bigint): Promise<void>;
  insertTrade(trade: TradeEntry): Promise<void>;
}

/** One indexer batch == one transaction: all events + the cursor move, atomically. */
export interface ProjectionUnitOfWork {
  withTransaction<T>(fn: (store: ProjectionStore) => Promise<T>): Promise<T>;
}

// ─────────────────────────── read side (API queries) ───────────────────────────

export interface CampaignQueryStore {
  listCampaigns(chainId: number): Promise<CampaignState[]>;
  getCampaign(address: Address): Promise<CampaignState | null>;
  listCohorts(campaign: Address): Promise<CohortState[]>;
  listActivityForCampaign(campaign: Address, limit: number): Promise<ActivityEntry[]>;
  listActivityForAccount(account: Address, limit: number): Promise<ActivityEntry[]>;
  /** Campaigns where the account has a position row or any share row. */
  listCampaignsForAccount(account: Address): Promise<Address[]>;
  getPosition(campaign: Address, account: Address): Promise<PositionState | null>;
  listSharesForAccount(campaign: Address, account: Address): Promise<ShareState[]>;
}

export interface OrderStore {
  insertOrder(order: StoredOrder): Promise<void>;
  hasOrder(campaign: Address, orderHash: Hex): Promise<boolean>;
  /** Open orders for a campaign (optionally one cohort), newest first. */
  listOpenOrders(campaign: Address, cohortId?: number): Promise<StoredOrder[]>;
  listOpenNonces(campaign: Address, maker: Address): Promise<bigint[]>;
  getMinValidNonce(campaign: Address, maker: Address): Promise<bigint>;
  listTrades(campaign: Address, cohortId: number | undefined, limit: number): Promise<TradeEntry[]>;
}

export interface MetadataStore {
  get(campaign: Address): Promise<CampaignMetadata | null>;
  /** Returns the previous auth timestamp (anti-replay watermark), if any. */
  getAuthWatermark(campaign: Address): Promise<Date | null>;
  put(meta: CampaignMetadata, authIssuedAt: Date): Promise<void>;
}

// ─────────────────────────── chain access ───────────────────────────

export interface ChainSource {
  /** Latest chain head block number. */
  getHead(): Promise<bigint>;
  /** Factory CampaignCreated events in [from, to]. */
  getFactoryEvents(from: bigint, to: bigint): Promise<ChainEvent[]>;
  /** All campaign events for the given clone addresses in [from, to]. */
  getCampaignEvents(addresses: Address[], from: bigint, to: bigint): Promise<ChainEvent[]>;
  /** Block where the factory was deployed (start of history). */
  findFactoryDeployBlock(): Promise<bigint>;
}

// ─────────────────────────── crypto verification ───────────────────────────

export interface OrderSignatureVerifier {
  /** EIP-712 order hash for the campaign's domain (name CampaignV3, version 1). */
  hashOrder(campaign: Address, order: OrderIntent): Hex;
  /** True when `signature` is the maker's signature over the order. */
  verifyOrder(campaign: Address, order: OrderIntent, signature: Hex): Promise<boolean>;
}

export interface PersonalSignVerifier {
  /** Recovers the signer of an EIP-191 personal_sign message, or null. */
  recover(message: string, signature: Hex): Promise<Address | null>;
}

// ─────────────────────────── file storage ───────────────────────────

export interface FileStore {
  readonly enabled: boolean;
  /** Stores cover bytes, returns the public URL. */
  putCover(campaign: Address, bytes: Buffer, contentType: string): Promise<string>;
}

// ─────────────────────────── logging ───────────────────────────

export interface Logger {
  debug(obj: object | string, msg?: string): void;
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
}
