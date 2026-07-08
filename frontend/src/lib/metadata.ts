// Off-chain campaign metadata. CampaignV3 stores no name/description/cover on-chain, so seeded
// testnet campaigns are named here. New campaigns fall back to a derived name until a metadata
// backend exists. Keys are lowercased addresses.
export interface CampaignMeta {
  name: string;
  description: string;
  coverUrl?: string;
}

export const TESTNET_CAMPAIGN_METADATA: Record<string, CampaignMeta> = {
  "0xbfe9d8d0636d5acd171a1a223e2db161ce454ae8": {
    name: "Aurora Compute",
    description: "Distributed GPU cycles for open model training.",
  },
  "0x251ab14c74ee03009a5a12ee7415808014508463": {
    name: "Meridian Yield",
    description: "Delta-neutral basis trades across major pairs.",
  },
  "0x6000c3721c6637161455e78c88a42411e342191d": {
    name: "Tessellate Labs",
    description: "On-chain simulation primitives for autonomous worlds.",
  },
  "0x955a7388f8d1b83d930f5f8a56ab3c49e56faf38": {
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
