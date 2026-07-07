import { campaignV3Abi } from "./abi/campaignV3";
import { campaignV3FactoryAbi } from "./abi/campaignV3Factory";
import { testUsdcAbi } from "./abi/testUsdc";
import { FACTORY_ADDRESS, TOKEN_ADDRESS } from "./config";

/** Factory contract config (address + abi) for wagmi. */
export const factoryContract = {
  address: FACTORY_ADDRESS,
  abi: campaignV3FactoryAbi,
} as const;

/** Fundraising token (USDC on mainnet, TestUSDC on testnet). */
export const tokenContract = {
  address: TOKEN_ADDRESS,
  abi: testUsdcAbi,
} as const;

/** Build a CampaignV3 contract config for a given campaign clone address. */
export const campaignContract = (address: `0x${string}`) =>
  ({ address, abi: campaignV3Abi }) as const;
