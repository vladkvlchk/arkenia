import { http } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

export const FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`) ||
  ("0x475C933d687C7C2B20138D235DAb234D4cec7a90" as `0x${string}`);

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
export const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || API_URL;

export const wagmiConfig = getDefaultConfig({
  appName: "Onchain Fundraiser",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "demo-project-id",
  chains: [sepolia, hardhat],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
  ssr: true,
});
