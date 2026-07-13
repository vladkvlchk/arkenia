/**
 * Static, env-driven display config for the presentational layer.
 * Deliberately free of wagmi/viem imports so shared/ui stays pure.
 * Chain wiring itself lives in src/lib/config.ts.
 */

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);

export const IS_TESTNET = CHAIN_ID === 84532;

export const CHAIN_NAME = IS_TESTNET ? "Base Sepolia" : "Base";

export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  (IS_TESTNET ? "https://sepolia.basescan.org" : "https://basescan.org");

/** Fundraising token symbol: faucet tUSDC on testnet, USDC on mainnet. */
export const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TOKEN_SYMBOL || (IS_TESTNET ? "tUSDC" : "USDC");

export const TOKEN_ADDRESS =
  process.env.NEXT_PUBLIC_TOKEN_ADDRESS ||
  (IS_TESTNET
    ? "0xf586Cb41F0A87A2F37FA4acAc4C09Ea6d27fA53e"
    : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");

export const FACTORY_ADDRESS =
  process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "0x20D5728912f834aD868850cdf6678C1B32692652";

export function explorerAddressUrl(address: string) {
  return `${EXPLORER_URL}/address/${address}`;
}

export function explorerTxUrl(hash: string) {
  return `${EXPLORER_URL}/tx/${hash}`;
}

/**
 * V3 backend REST base (backend-v3). NEXT_PUBLIC_API_URL points at the "/api" root; the versioned
 * surface lives under "/v3". Absent locally → the indexer's default dev port.
 */
const API_ROOT = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002/api";
export const API_V3_URL = `${API_ROOT.replace(/\/+$/, "")}/v3`;

/**
 * Backend-backed features (persisted metadata, activity, positions, premarket book) light up
 * whenever an API base is configured — both contours run the V3 backend. Individual calls
 * degrade to on-chain reads / empty states when the backend is unreachable.
 */
export const API_ENABLED = Boolean(process.env.NEXT_PUBLIC_API_URL);
