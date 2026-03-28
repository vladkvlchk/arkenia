import { http } from "wagmi";
import { base } from "wagmi/chains";
import { createConfig } from "@privy-io/wagmi";

export const FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`) ||
  ("0x193c63A79453edDf20B6374557414538A8c19783" as `0x${string}`);

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
export const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || API_URL;

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
  },
});
