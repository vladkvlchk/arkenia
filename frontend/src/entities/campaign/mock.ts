import type { ActivityItem, Campaign, Cohort } from "./types";

/**
 * TODO(onchain): delete this module once the indexer/contract reads are wired.
 * Numbers are internally consistent (claimable = returned × yourShares / totalShares)
 * so the UI demonstrates real accounting behaviour.
 */

export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    address: "0xa71a3ae1bbbd6d82e5b6f9c22f1c5da75c3bf2ad",
    name: "Atlas Deep Compute",
    description: "Early allocations in decentralised GPU and inference infrastructure.",
    angel: { address: "0x8c1e4bd0aa7c2f9e33d05b6a91c4e7f2d8b0a3c5", label: "atlas.base.eth" },
    status: "open",
    poolBalance: 402910,
    totalDeposited: 881000,
    totalWithdrawn: 466000,
    totalReturned: 186600,
    cohortCount: 3,
    believers: 214,
    createdAt: "2026-02-20T10:00:00Z",
    // Mock cover engravings (local SVGs); real campaigns upload their own banner.
    coverUrl: "/covers/atlas.svg",
  },
  {
    address: "0x54f7a9c2e8d1b3f6a0c5d9e2b7f4a1c8d3e6f0b2",
    name: "Meridian Robotics",
    description: "Seed exposure to warehouse automation and embodied-AI teams.",
    angel: { address: "0x2f8db64c1a9e5d73b0f4c8a2e6d1b9f5a3c7e0d4" },
    status: "open",
    poolBalance: 128400,
    totalDeposited: 445000,
    totalWithdrawn: 310000,
    totalReturned: 96120,
    cohortCount: 2,
    believers: 87,
    createdAt: "2026-03-08T09:00:00Z",
    coverUrl: "/covers/meridian.svg",
  },
  {
    address: "0x9b3c5e7f1a2d4b6c8e0f3a5d7b9c1e4f6a8d0b2c",
    name: "Helio Grid Storage",
    description: "Distributed battery-storage projects on industrial sites.",
    angel: { address: "0x6a4f2c8e0b5d9a3f7c1e6b0d4a8f2c5e9b3d7a1f" },
    status: "open",
    poolBalance: 58220,
    totalDeposited: 98220,
    totalWithdrawn: 40000,
    totalReturned: 0,
    cohortCount: 1,
    believers: 41,
    createdAt: "2026-05-14T12:00:00Z",
  },
  {
    address: "0x3d8e1f5a7c2b9e4d0f6a3c8b5e1d7f2a9c4e0b6d",
    name: "Nimbus Bio Syndicate",
    description: "Pre-seed biotech tooling; long horizon, small cheques.",
    angel: { address: "0xd15b8a3e6f0c4b7d2a9e5f1c8b3d6a0e4f7c2b9a" },
    status: "open",
    poolBalance: 12500,
    totalDeposited: 12500,
    totalWithdrawn: 0,
    totalReturned: 0,
    cohortCount: 0,
    believers: 6,
    createdAt: "2026-06-28T16:00:00Z",
  },
  {
    address: "0xe2c6a4f8b0d3e7a1c5f9b2d6e0a4c8f3b7d1e5a9",
    name: "Kestrel Frontier",
    description: "First Arkenia campaign — fully wound down at 1.24× aggregate.",
    angel: { address: "0x4e0b7d2a9c5f1e8b3d6a0c4f7b2e9d5a1c8f3b6e", label: "kestrel.base.eth" },
    status: "closed",
    poolBalance: 0,
    totalDeposited: 540000,
    totalWithdrawn: 512000,
    totalReturned: 634800,
    cohortCount: 4,
    believers: 156,
    createdAt: "2025-09-02T08:00:00Z",
    coverUrl: "/covers/kestrel.svg",
  },
];

/** Cohorts of Atlas Deep Compute, viewed as the mock connected wallet. */
export const MOCK_COHORTS: Cohort[] = [
  {
    campaignAddress: "0xa71a3ae1bbbd6d82e5b6f9c22f1c5da75c3bf2ad",
    index: 1,
    formedAt: "2026-03-12T14:20:00Z",
    totalShares: 150000,
    returned: 45000,
    yourShares: 2400,
    yourClaimable: 720,
  },
  {
    campaignAddress: "0xa71a3ae1bbbd6d82e5b6f9c22f1c5da75c3bf2ad",
    index: 2,
    formedAt: "2026-05-02T09:45:00Z",
    totalShares: 220000,
    returned: 84000,
    yourShares: 0,
    yourClaimable: 0,
  },
  {
    campaignAddress: "0xa71a3ae1bbbd6d82e5b6f9c22f1c5da75c3bf2ad",
    index: 3,
    formedAt: "2026-06-18T11:05:00Z",
    totalShares: 96000,
    returned: 57600,
    yourShares: 5000,
    yourClaimable: 3000,
  },
];

/** Viewer's refundable pool balance in Atlas Deep Compute. */
export const MOCK_YOUR_POOL_BALANCE = 1250;

export const MOCK_ACTIVITY: ActivityItem[] = [
  {
    id: "a1",
    type: "deposit",
    actor: "0x9a42c7e1f5b8d3a6c0e4f7b2d9a5c1e8f3b6d0a4",
    amount: 25000,
    txHash: "0x7d3f2a8c5e1b9d4f6a0c3e7b2d8f5a1c9e4b6d0a3f7c2e8b5d1a9f4c6e0b3d7a",
    at: "2026-07-06T18:42:00Z",
  },
  {
    id: "a2",
    type: "return",
    actor: "0x8c1e4bd0aa7c2f9e33d05b6a91c4e7f2d8b0a3c5",
    amount: 12000,
    cohortIndex: 2,
    txHash: "0x3e8b5d1a9f4c6e0b3d7a7d3f2a8c5e1b9d4f6a0c3e7b2d8f5a1c9e4b6d0a3f7c",
    at: "2026-07-05T09:12:00Z",
  },
  {
    id: "a3",
    type: "claim",
    actor: "0x44d9f2c6e0a3b7d1f5c8e2a6b0d4f9c3e7a1b5d8",
    amount: 850,
    cohortIndex: 2,
    txHash: "0x9f4c6e0b3d7a3e8b5d1a7d3f2a8c5e1b9d4f6a0c3e7b2d8f5a1c9e4b6d0a3f7c",
    at: "2026-07-03T21:30:00Z",
  },
  {
    id: "a4",
    type: "withdraw",
    actor: "0x8c1e4bd0aa7c2f9e33d05b6a91c4e7f2d8b0a3c5",
    amount: 96000,
    cohortIndex: 3,
    txHash: "0x1c9e4b6d0a3f7c3e8b5d1a9f4c6e0b3d7a7d3f2a8c5e1b9d4f6a0c3e7b2d8f5a",
    at: "2026-06-18T11:05:00Z",
  },
  {
    id: "a5",
    type: "refund",
    actor: "0x71b3e5d9a2c6f0b4d8e1a5c9f3b7d0e4a8c2f6b1",
    amount: 2000,
    txHash: "0x5a1c9e4b6d0a3f7c3e8b5d1a9f4c6e0b3d7a7d3f2a8c5e1b9d4f6a0c3e7b2d8f",
    at: "2026-06-15T07:58:00Z",
  },
  {
    id: "a6",
    type: "deposit",
    actor: "0xbd60a4f8c2e6b0d3f7a1c5e9b4d8f2a6c0e3b7d1",
    amount: 5000,
    txHash: "0x2d8f5a1c9e4b6d0a3f7c3e8b5d1a9f4c6e0b3d7a7d3f2a8c5e1b9d4f6a0c3e7b",
    at: "2026-06-12T13:24:00Z",
  },
];

/* ------------------------------------------------------------------ */
/* Large index — demo data for search + pagination on /campaigns.      */
/* Deterministic PRNG (no Math.random) so SSR and client render the    */
/* same list. TODO(onchain): the whole index comes from the indexer.   */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aster", "Basalt", "Caldera", "Drift", "Ember", "Fathom", "Gale", "Harbor",
  "Iron", "Juniper", "Krait", "Lumen", "Mistral", "Noon", "Onyx", "Pluma",
  "Quarry", "Rove", "Sable", "Tessera", "Umber", "Vantage", "Wren", "Zephyr",
];
const SECOND = [
  "Analytics", "Autonomy", "Batteries", "Biotech", "Cartography", "Compute",
  "Foundry", "Genomics", "Habitats", "Instruments", "Kinetics", "Logistics",
  "Materials", "Navigation", "Optics", "Photonics", "Propulsion", "Robotics",
  "Sensors", "Studios", "Synthesis", "Telemetry",
];
const BLURBS = [
  (d: string) => `Early cheques into ${d} teams shipping hardware-adjacent software.`,
  (d: string) => `Seed allocations across independent ${d} labs in three regions.`,
  (d: string) => `Backing pre-product founders working on applied ${d}.`,
  (d: string) => `A slow syndicate for ${d} — small cheques, long horizon.`,
  (d: string) => `Rolling exposure to ${d} infrastructure and tooling.`,
  (d: string) => `First-money positions in open-source ${d} companies.`,
  (d: string) => `Concentrated bets on ${d} spinouts from university groups.`,
  (d: string) => `Follow-on capital for ${d} pilots that already have revenue.`,
];
const COVERS = ["/covers/atlas.svg", "/covers/meridian.svg", "/covers/kestrel.svg"];

function generateCampaignIndex(count: number): Campaign[] {
  const rnd = mulberry32(0xa11ce);
  const hexAddress = () => {
    let s = "0x";
    for (let j = 0; j < 40; j++) s += "0123456789abcdef"[Math.floor(rnd() * 16)];
    return s as `0x${string}`;
  };
  const round10 = (n: number) => Math.round(n / 10) * 10;

  return Array.from({ length: count }, (_, i) => {
    // 23 is coprime with 528 (24×22) → every name pair is unique.
    const idx = (i * 23) % 528;
    const first = FIRST[idx % 24];
    const second = SECOND[Math.floor(idx / 24)];

    const roll = rnd();
    const status: Campaign["status"] = roll < 0.68 ? "open" : roll < 0.85 ? "returning" : "closed";

    // Log-uniform 300 … ~1.1M so every ledger-grid grain step shows up in the index.
    const totalDeposited = round10(300 * Math.pow(10, rnd() * 3.55));
    const withdrawnFrac =
      status === "open" ? rnd() * 0.7 : status === "returning" ? 0.5 + rnd() * 0.4 : 0.85 + rnd() * 0.15;
    const totalWithdrawn = round10(totalDeposited * withdrawnFrac);
    const returnedFrac =
      status === "open"
        ? (rnd() < 0.5 ? 0 : rnd() * 0.5)
        : status === "returning"
          ? 0.3 + rnd() * 0.6
          : 0.7 + rnd();
    const totalReturned = round10(totalWithdrawn * returnedFrac);

    return {
      address: hexAddress(),
      name: `${first} ${second}`,
      description: BLURBS[Math.floor(rnd() * BLURBS.length)](second.toLowerCase()),
      angel: {
        address: hexAddress(),
        ...(i % 6 === 2 ? { label: `${first.toLowerCase()}.base.eth` } : {}),
      },
      status,
      poolBalance: status === "closed" ? 0 : totalDeposited - totalWithdrawn,
      totalDeposited,
      totalWithdrawn,
      totalReturned,
      cohortCount:
        totalWithdrawn === 0
          ? 0
          : status === "open"
            ? 1 + Math.floor(rnd() * 3)
            : status === "returning"
              ? 1 + Math.floor(rnd() * 4)
              : 2 + Math.floor(rnd() * 4),
      believers: Math.max(2, Math.round((Math.sqrt(totalDeposited) / 3) * (0.6 + rnd() * 0.9))),
      createdAt: new Date(Date.UTC(2025, 7, 1) + Math.floor(rnd() * 330) * 86_400_000).toISOString(),
      ...(i % 4 === 1 ? { coverUrl: COVERS[(i >> 2) % 3] } : {}),
    };
  });
}

/** The full demo index: the five curated campaigns + a generated long tail. */
export const MOCK_CAMPAIGNS_MANY: Campaign[] = [
  ...MOCK_CAMPAIGNS,
  ...generateCampaignIndex(115),
];

export function getCampaign(address: string): Campaign | undefined {
  return MOCK_CAMPAIGNS_MANY.find((c) => c.address.toLowerCase() === address.toLowerCase());
}

export function getCohorts(campaignAddress: string): Cohort[] {
  return MOCK_COHORTS.filter(
    (c) => c.campaignAddress.toLowerCase() === campaignAddress.toLowerCase()
  );
}
