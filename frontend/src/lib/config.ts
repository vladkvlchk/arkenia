import { http } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { createConfig } from "@privy-io/wagmi";

// Target chain, driven by env. Defaults to Base mainnet so the production app is unaffected
// when the var is absent. Set NEXT_PUBLIC_CHAIN_ID=84532 for the Base Sepolia testnet deploy.
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || base.id);
export const activeChain = CHAIN_ID === baseSepolia.id ? baseSepolia : base;
export const isTestnet = activeChain.id === baseSepolia.id;

export const FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`) ||
  ("0x193c63A79453edDf20B6374557414538A8c19783" as `0x${string}`);

// Fundraising token: USDC on mainnet, TestUSDC (faucet) on testnet.
export const TOKEN_ADDRESS =
  (process.env.NEXT_PUBLIC_TOKEN_ADDRESS as `0x${string}`) ||
  ("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as `0x${string}`);

// Block-explorer base for the active chain (basescan / sepolia.basescan).
export const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  activeChain.blockExplorers?.default.url ||
  "https://basescan.org";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
export const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || API_URL;

// NEXT_PUBLIC_RPC_URL is the chain-agnostic name; NEXT_PUBLIC_BASE_RPC_URL kept for back-compat.
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || process.env.NEXT_PUBLIC_BASE_RPC_URL;

const chains = [activeChain] as const;

export const wagmiConfig = createConfig({
  chains,
  // Only `activeChain` is registered in `chains`, but wagmi's union type wants a transport
  // per possible id. The active chain uses our env RPC; the other falls back to its public default.
  transports: {
    [base.id]: http(activeChain.id === base.id ? rpcUrl : undefined),
    [baseSepolia.id]: http(activeChain.id === baseSepolia.id ? rpcUrl : undefined),
  },
});
