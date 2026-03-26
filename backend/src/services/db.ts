import { Pool } from "pg";
import { config } from "../config";

const pool = new Pool({ connectionString: config.databaseUrl });

export function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      wallet TEXT PRIMARY KEY,
      twitter_id TEXT UNIQUE,
      twitter_username TEXT,
      twitter_avatar TEXT,
      linked_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      block_number BIGINT NOT NULL,
      campaign TEXT NOT NULL,
      event_name TEXT NOT NULL,
      args JSONB NOT NULL,
      indexed_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(tx_hash, log_index)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_stats (
      campaign TEXT PRIMARY KEY,
      creator TEXT NOT NULL,
      token TEXT NOT NULL,
      token_symbol TEXT NOT NULL,
      token_decimals INTEGER NOT NULL,
      floor_amount NUMERIC NOT NULL,
      ceil_amount NUMERIC NOT NULL,
      total_raised NUMERIC DEFAULT 0,
      total_returned NUMERIC DEFAULT 0,
      investor_count INTEGER DEFAULT 0,
      withdrawn_at BIGINT DEFAULT 0,
      pnl NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_stats (
      wallet TEXT PRIMARY KEY,
      campaigns_created INTEGER DEFAULT 0,
      creator_total_raised NUMERIC DEFAULT 0,
      creator_total_returned NUMERIC DEFAULT 0,
      creator_pnl NUMERIC DEFAULT 0,
      campaigns_invested INTEGER DEFAULT 0,
      investor_total_deposited NUMERIC DEFAULT 0,
      investor_total_claimed NUMERIC DEFAULT 0,
      investor_total_refunded NUMERIC DEFAULT 0,
      investor_pnl NUMERIC DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_meta (
      campaign TEXT PRIMARY KEY,
      creator TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      campaign TEXT NOT NULL,
      parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_campaign ON comments(campaign)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id)`);

  // Migration: add columns if table already exists
  await pool.query(`ALTER TABLE campaign_meta ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE campaign_meta ADD COLUMN IF NOT EXISTS cover_url TEXT DEFAULT ''`);

  // Seed test profiles
  const seeds = [
    { wallet: "0xaaa1000000000000000000000000000000000001", id: "seed_1", username: "laurashin" },
    { wallet: "0xaaa2000000000000000000000000000000000002", id: "seed_2", username: "Zeneca" },
    { wallet: "0xaaa3000000000000000000000000000000000003", id: "seed_3", username: "DeeZe" },
    { wallet: "0xaaa4000000000000000000000000000000000004", id: "seed_4", username: "udiWertheimer" },
    { wallet: "0xaaa5000000000000000000000000000000000005", id: "seed_5", username: "paradigm" },
    { wallet: "0xaaa6000000000000000000000000000000000006", id: "seed_6", username: "moonpay" },
  ];

  for (const s of seeds) {
    await pool.query(
      `INSERT INTO profiles (wallet, twitter_id, twitter_username, twitter_avatar)
       VALUES ($1, $2, $3, '')
       ON CONFLICT (wallet) DO NOTHING`,
      [s.wallet, s.id, s.username]
    );
  }
}

export async function upsertProfile(
  wallet: string,
  twitter: { id: string; username: string; avatar: string }
) {
  await pool.query(
    `INSERT INTO profiles (wallet, twitter_id, twitter_username, twitter_avatar)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (wallet) DO UPDATE SET
       twitter_id = $2,
       twitter_username = $3,
       twitter_avatar = $4,
       linked_at = NOW()`,
    [wallet.toLowerCase(), twitter.id, twitter.username, twitter.avatar]
  );
}

export async function getProfile(wallet: string) {
  const { rows } = await pool.query(
    "SELECT * FROM profiles WHERE wallet = $1",
    [wallet.toLowerCase()]
  );
  return rows[0] || null;
}

export async function searchProfiles(query: string) {
  const { rows } = await pool.query(
    `SELECT wallet, twitter_username, twitter_avatar, linked_at
     FROM profiles
     WHERE twitter_username ILIKE $1 OR wallet ILIKE $1
     ORDER BY linked_at DESC
     LIMIT 50`,
    [`%${query}%`]
  );
  return rows;
}

export async function getAllProfiles() {
  const { rows } = await pool.query(
    `SELECT wallet, twitter_username, twitter_avatar, linked_at
     FROM profiles
     ORDER BY linked_at DESC
     LIMIT 50`
  );
  return rows;
}

// --- Event indexer functions ---

export async function insertEvent(
  txHash: string,
  logIndex: number,
  blockNumber: number,
  campaign: string,
  eventName: string,
  args: Record<string, unknown>
) {
  await pool.query(
    `INSERT INTO events (tx_hash, log_index, block_number, campaign, event_name, args)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tx_hash, log_index) DO NOTHING`,
    [txHash, logIndex, blockNumber, campaign.toLowerCase(), eventName, JSON.stringify(args)]
  );
}

export async function upsertCampaignStats(stats: {
  campaign: string;
  creator: string;
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  floorAmount: string;
  ceilAmount: string;
  totalRaised: string;
  totalReturned: string;
  investorCount: number;
  withdrawnAt: number;
  pnl: string;
  status: string;
}) {
  await pool.query(
    `INSERT INTO campaign_stats (campaign, creator, token, token_symbol, token_decimals, floor_amount, ceil_amount, total_raised, total_returned, investor_count, withdrawn_at, pnl, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (campaign) DO UPDATE SET
       total_raised = $8,
       total_returned = $9,
       investor_count = $10,
       withdrawn_at = $11,
       pnl = $12,
       status = $13,
       updated_at = NOW()`,
    [
      stats.campaign.toLowerCase(),
      stats.creator.toLowerCase(),
      stats.token.toLowerCase(),
      stats.tokenSymbol,
      stats.tokenDecimals,
      stats.floorAmount,
      stats.ceilAmount,
      stats.totalRaised,
      stats.totalReturned,
      stats.investorCount,
      stats.withdrawnAt,
      stats.pnl,
      stats.status,
    ]
  );
}

export async function upsertUserStats(stats: {
  wallet: string;
  campaignsCreated: number;
  creatorTotalRaised: string;
  creatorTotalReturned: string;
  creatorPnl: string;
  campaignsInvested: number;
  investorTotalDeposited: string;
  investorTotalClaimed: string;
  investorTotalRefunded: string;
  investorPnl: string;
}) {
  await pool.query(
    `INSERT INTO user_stats (wallet, campaigns_created, creator_total_raised, creator_total_returned, creator_pnl, campaigns_invested, investor_total_deposited, investor_total_claimed, investor_total_refunded, investor_pnl)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (wallet) DO UPDATE SET
       campaigns_created = $2,
       creator_total_raised = $3,
       creator_total_returned = $4,
       creator_pnl = $5,
       campaigns_invested = $6,
       investor_total_deposited = $7,
       investor_total_claimed = $8,
       investor_total_refunded = $9,
       investor_pnl = $10,
       updated_at = NOW()`,
    [
      stats.wallet.toLowerCase(),
      stats.campaignsCreated,
      stats.creatorTotalRaised,
      stats.creatorTotalReturned,
      stats.creatorPnl,
      stats.campaignsInvested,
      stats.investorTotalDeposited,
      stats.investorTotalClaimed,
      stats.investorTotalRefunded,
      stats.investorPnl,
    ]
  );
}

export async function getCampaignStats(campaign: string) {
  const { rows } = await pool.query(
    "SELECT * FROM campaign_stats WHERE campaign = $1",
    [campaign.toLowerCase()]
  );
  return rows[0] || null;
}

export async function getAllCampaignStats() {
  const { rows } = await pool.query(
    "SELECT * FROM campaign_stats ORDER BY created_at DESC"
  );
  return rows;
}

export async function getUserStats(wallet: string) {
  const { rows } = await pool.query(
    "SELECT * FROM user_stats WHERE wallet = $1",
    [wallet.toLowerCase()]
  );
  return rows[0] || null;
}

export async function getLeaderboard(sortBy: string = "creator_pnl", limit: number = 50) {
  const allowedColumns = [
    "creator_pnl", "investor_pnl", "creator_total_raised",
    "investor_total_deposited", "campaigns_created", "campaigns_invested",
  ];
  const col = allowedColumns.includes(sortBy) ? sortBy : "creator_pnl";
  const { rows } = await pool.query(
    `SELECT us.*, p.twitter_username, p.twitter_avatar
     FROM user_stats us
     LEFT JOIN profiles p ON us.wallet = p.wallet
     ORDER BY ${col} DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function getEventsForCampaign(campaign: string) {
  const { rows } = await pool.query(
    "SELECT * FROM events WHERE campaign = $1 ORDER BY block_number, log_index",
    [campaign.toLowerCase()]
  );
  return rows;
}

export async function getEventsForWallet(wallet: string) {
  const { rows } = await pool.query(
    `SELECT * FROM events
     WHERE args->>'investor' = $1 OR args->>'creator' = $1
     ORDER BY block_number, log_index`,
    [wallet.toLowerCase()]
  );
  return rows;
}

export async function getIndexerState(key: string): Promise<string | null> {
  const { rows } = await pool.query(
    "SELECT value FROM indexer_state WHERE key = $1",
    [key]
  );
  return rows[0]?.value || null;
}

export async function setIndexerState(key: string, value: string) {
  await pool.query(
    `INSERT INTO indexer_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, value]
  );
}

// --- Campaign metadata ---

export async function upsertCampaignMeta(
  campaign: string,
  creator: string,
  name: string,
  description: string,
  logoUrl: string = "",
  coverUrl: string = ""
) {
  await pool.query(
    `INSERT INTO campaign_meta (campaign, creator, name, description, logo_url, cover_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (campaign) DO UPDATE SET
       name = $3,
       description = $4,
       logo_url = CASE WHEN $5 = '' THEN campaign_meta.logo_url ELSE $5 END,
       cover_url = CASE WHEN $6 = '' THEN campaign_meta.cover_url ELSE $6 END,
       updated_at = NOW()`,
    [campaign.toLowerCase(), creator.toLowerCase(), name, description, logoUrl, coverUrl]
  );
}

export async function getCampaignMeta(campaign: string) {
  const { rows } = await pool.query(
    "SELECT * FROM campaign_meta WHERE campaign = $1",
    [campaign.toLowerCase()]
  );
  return rows[0] || null;
}

export async function getAllCampaignMeta() {
  const { rows } = await pool.query(
    "SELECT * FROM campaign_meta ORDER BY created_at DESC"
  );
  return rows;
}

export async function getCampaignsByUsername(username: string) {
  const { rows } = await pool.query(
    `SELECT cm.campaign, cm.name, cm.created_at
     FROM campaign_meta cm
     JOIN profiles p ON cm.creator = p.wallet
     WHERE LOWER(p.twitter_username) = LOWER($1)
     ORDER BY cm.created_at DESC`,
    [username]
  );
  return rows;
}

// --- Comments ---

export async function insertComment(
  campaign: string,
  author: string,
  content: string,
  parentId?: number | null
) {
  const { rows } = await pool.query(
    `INSERT INTO comments (campaign, author, content, parent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [campaign.toLowerCase(), author.toLowerCase(), content, parentId ?? null]
  );
  return rows[0];
}

export async function getComments(campaign: string) {
  const { rows } = await pool.query(
    `SELECT * FROM comments WHERE campaign = $1 ORDER BY created_at ASC`,
    [campaign.toLowerCase()]
  );
  return rows;
}
