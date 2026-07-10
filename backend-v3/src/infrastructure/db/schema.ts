/**
 * Drizzle schema. Conventions:
 * - every address / hash column is lowercase text;
 * - every on-chain quantity is numeric(78,0) mapped to bigint (uint256-safe);
 * - blocks are int8 (bigint) — plenty for any EVM chain.
 */

import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** uint256 ↔ bigint via Postgres numeric(78,0). */
const u256 = customType<{ data: bigint; driverData: string }>({
  dataType: () => "numeric(78,0)",
  fromDriver: (value) => BigInt(value),
  toDriver: (value) => value.toString(),
});

const addr = (name: string) => text(name);
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const indexerCursor = pgTable("indexer_cursor", {
  chainId: integer("chain_id").primaryKey(),
  lastBlock: bigint("last_block", { mode: "bigint" }).notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const chainEvents = pgTable(
  "chain_events",
  {
    chainId: integer("chain_id").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    campaign: addr("campaign").notNull(),
    eventName: text("event_name").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockTime: ts("block_time").notNull(),
    args: jsonb("args").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chainId, t.txHash, t.logIndex] }),
    index("chain_events_campaign_idx").on(t.campaign, t.blockNumber),
  ]
);

export const campaigns = pgTable(
  "campaigns",
  {
    address: addr("address").primaryKey(),
    chainId: integer("chain_id").notNull(),
    angel: addr("angel").notNull(),
    token: addr("token").notNull(),
    createdAt: ts("created_at").notNull(),
    createdBlock: bigint("created_block", { mode: "bigint" }).notNull(),
    poolTotal: u256("pool_total").notNull(),
    totalShares: u256("total_shares").notNull(),
    globalAccRay: u256("global_acc_ray").notNull(),
    rewardReserves: u256("reward_reserves").notNull(),
    currentCohort: integer("current_cohort").notNull(),
    lifetimeDeposited: u256("lifetime_deposited").notNull(),
    lifetimeReturned: u256("lifetime_returned").notNull(),
    believers: integer("believers").notNull(),
  },
  (t) => [index("campaigns_chain_idx").on(t.chainId, t.createdBlock)]
);

export const cohorts = pgTable(
  "cohorts",
  {
    campaign: addr("campaign").notNull(),
    cohortId: integer("cohort_id").notNull(),
    fractionRay: u256("fraction_ray").notNull(),
    totalShares: u256("total_shares").notNull(),
    accRay: u256("acc_ray").notNull(),
    globalAccAtBirthRay: u256("global_acc_at_birth_ray").notNull(),
    returned: u256("returned").notNull(),
    formedAt: ts("formed_at").notNull(),
    formedBlock: bigint("formed_block", { mode: "bigint" }).notNull(),
    formedTx: text("formed_tx").notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaign, t.cohortId] })]
);

export const positions = pgTable(
  "positions",
  {
    campaign: addr("campaign").notNull(),
    account: addr("account").notNull(),
    poolBalance: u256("pool_balance").notNull(),
    settledUpTo: integer("settled_up_to").notNull(),
    accruedReward: u256("accrued_reward").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.campaign, t.account] }),
    index("positions_account_idx").on(t.account),
  ]
);

export const shares = pgTable(
  "shares",
  {
    campaign: addr("campaign").notNull(),
    cohortId: integer("cohort_id").notNull(),
    account: addr("account").notNull(),
    shares: u256("shares").notNull(),
    rewardDebt: u256("reward_debt").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.campaign, t.cohortId, t.account] }),
    index("shares_account_idx").on(t.campaign, t.account),
    index("shares_account_global_idx").on(t.account),
  ]
);

export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(), // `${txHash}-${logIndex}`
    campaign: addr("campaign").notNull(),
    type: text("type").notNull(),
    actor: addr("actor").notNull(),
    amount: u256("amount").notNull(),
    cohortId: integer("cohort_id"),
    txHash: text("tx_hash").notNull(),
    at: ts("at").notNull(),
  },
  (t) => [
    index("activity_campaign_idx").on(t.campaign, t.at),
    index("activity_actor_idx").on(t.actor, t.at),
  ]
);

export const orders = pgTable(
  "orders",
  {
    campaign: addr("campaign").notNull(),
    orderHash: text("order_hash").notNull(),
    maker: addr("maker").notNull(),
    isSell: boolean("is_sell").notNull(),
    cohortId: integer("cohort_id").notNull(),
    shareAmount: u256("share_amount").notNull(),
    usdcAmount: u256("usdc_amount").notNull(),
    nonce: u256("nonce").notNull(),
    deadline: u256("deadline").notNull(),
    signature: text("signature").notNull(),
    status: text("status").notNull(), // open | filled | cancelled | invalidated
    filledShares: u256("filled_shares").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.campaign, t.orderHash] }),
    index("orders_book_idx").on(t.campaign, t.cohortId, t.status),
    index("orders_maker_idx").on(t.campaign, t.maker, t.status),
  ]
);

export const makerNonces = pgTable(
  "maker_nonces",
  {
    campaign: addr("campaign").notNull(),
    maker: addr("maker").notNull(),
    minValidNonce: u256("min_valid_nonce").notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaign, t.maker] })]
);

export const trades = pgTable(
  "trades",
  {
    id: text("id").primaryKey(), // `${txHash}-${logIndex}`
    campaign: addr("campaign").notNull(),
    cohortId: integer("cohort_id").notNull(),
    orderHash: text("order_hash").notNull(),
    maker: addr("maker").notNull(),
    taker: addr("taker").notNull(),
    shares: u256("shares").notNull(),
    usdc: u256("usdc").notNull(),
    makerIsSeller: boolean("maker_is_seller").notNull(),
    txHash: text("tx_hash").notNull(),
    at: ts("at").notNull(),
  },
  (t) => [index("trades_book_idx").on(t.campaign, t.cohortId, t.at)]
);

export const campaignMetadata = pgTable("campaign_metadata", {
  campaign: addr("campaign").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  coverUrl: text("cover_url"),
  updatedAt: ts("updated_at").notNull(),
  authIssuedAt: ts("auth_issued_at").notNull(),
});
