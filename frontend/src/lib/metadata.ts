// Off-chain campaign metadata. CampaignV3 stores no name/description/cover on-chain, so seeded
// testnet campaigns are named here. New campaigns fall back to a derived name until a metadata
// backend exists. Keys are lowercased addresses.
export interface CampaignMeta {
  name: string;
  description: string;
  coverUrl?: string;
}

export const TESTNET_CAMPAIGN_METADATA: Record<string, CampaignMeta> = {
  "0xce9ce282137528c916a15ad5542403bff51845ca": {
    name: "Aurora Compute",
    description: "Distributed GPU cycles for open model training.",
  },
  "0x011fca24bfc4aff93cb35b8bd2a74f3b3110eeba": {
    name: "Meridian Yield",
    description: "Delta-neutral basis trades across major pairs.",
  },
  "0x419d43acd96d73c73025999e3bbd6d4da5d155d4": {
    name: "Tessellate Labs",
    description: "On-chain simulation primitives for autonomous worlds.",
  },
  "0xe2e9d752ce5cf3831e9a6140d0106bac198c5bad": {
    name: "Vesper Seed",
    description: "Pre-launch community round — capital not yet deployed.",
  },
};

export function campaignMeta(address?: string): CampaignMeta {
  const found = address ? TESTNET_CAMPAIGN_METADATA[address.toLowerCase()] : undefined;
  if (found) return found;
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Campaign";
  return { name: `Campaign ${short}`, description: "" };
}
