/**
 * Env-driven configuration — the ONLY place environment is read. The same
 * build serves Base Sepolia and Base mainnet purely through these values;
 * nothing anywhere else may branch on "testnet vs mainnet".
 */

import "dotenv/config";
import { z } from "zod";

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed 20-byte address")
  .transform((a) => a.toLowerCase() as `0x${string}`);

const schema = z.object({
  CHAIN_ID: z.coerce.number().int().positive(),
  RPC_URL: z.string().url(),
  FACTORY_ADDRESS: address,
  /** Factory deploy block; discovered via binary search on eth_getCode when unset. */
  START_BLOCK: z.coerce.bigint().nonnegative().optional(),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3002),

  /** Fundraising token decimals (USDC and TestUSDC are both 6). */
  TOKEN_DECIMALS: z.coerce.number().int().min(0).max(18).default(6),

  /** Indexer tuning. */
  CONFIRMATIONS: z.coerce.number().int().min(0).default(5),
  LOG_BLOCK_RANGE: z.coerce.number().int().min(1).max(10_000).default(1000),
  POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(3000),

  CORS_ORIGIN: z.string().default("*"),
  MAX_COVER_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.parse(env);

  const r2 =
    parsed.R2_ACCOUNT_ID &&
    parsed.R2_ACCESS_KEY_ID &&
    parsed.R2_SECRET_ACCESS_KEY &&
    parsed.R2_BUCKET &&
    parsed.R2_PUBLIC_URL
      ? {
          accountId: parsed.R2_ACCOUNT_ID,
          accessKeyId: parsed.R2_ACCESS_KEY_ID,
          secretAccessKey: parsed.R2_SECRET_ACCESS_KEY,
          bucket: parsed.R2_BUCKET,
          publicUrl: parsed.R2_PUBLIC_URL.replace(/\/$/, ""),
        }
      : null;

  return {
    chainId: parsed.CHAIN_ID,
    rpcUrl: parsed.RPC_URL,
    factoryAddress: parsed.FACTORY_ADDRESS,
    startBlock: parsed.START_BLOCK,
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.PORT,
    tokenDecimals: parsed.TOKEN_DECIMALS,
    confirmations: parsed.CONFIRMATIONS,
    logBlockRange: parsed.LOG_BLOCK_RANGE,
    pollIntervalMs: parsed.POLL_INTERVAL_MS,
    corsOrigin: parsed.CORS_ORIGIN,
    maxCoverBytes: parsed.MAX_COVER_BYTES,
    logLevel: parsed.LOG_LEVEL,
    r2,
  };
}
