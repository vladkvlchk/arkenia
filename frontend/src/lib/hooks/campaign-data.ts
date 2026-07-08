"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import type { Campaign, CampaignStatus } from "@/entities/campaign/types";
import { campaignContract } from "../contracts";
import { campaignMeta } from "../metadata";
import { useCampaigns, useCampaignSummary, type CampaignSummary } from "./campaign";

type Addr = `0x${string}`;
const toNum = (x: bigint) => Number(formatUnits(x, 6));

/**
 * Builds the UI `Campaign` shape from on-chain reads + off-chain metadata.
 *
 * Exact from-chain: poolBalance, totalWithdrawn (== totalShares), cohortCount.
 * Derived: totalDeposited = pool + deployed; status from cohort count.
 * Proxy until the indexer lands: totalReturned uses rewardReserves (equals lifetime returned
 * until the first claim), believers = 0, createdAt = now. // TODO(onchain): indexer aggregates.
 */
function toCampaign(address: Addr, s: Omit<CampaignSummary, "token">): Campaign {
  const pool = toNum(s.poolTotal);
  const withdrawn = toNum(s.totalShares);
  const cohortCount = Number(s.currentCohort);
  const meta = campaignMeta(address);
  const status: CampaignStatus = cohortCount === 0 ? "open" : "returning";
  return {
    address,
    name: meta.name,
    description: meta.description,
    coverUrl: meta.coverUrl,
    angel: { address: s.angel },
    status,
    poolBalance: pool,
    totalDeposited: pool + withdrawn,
    totalWithdrawn: withdrawn,
    totalReturned: toNum(s.rewardReserves),
    cohortCount,
    believers: 0,
    createdAt: new Date().toISOString(),
  };
}

/** All campaigns from the factory, enriched to the UI shape (one multicall). */
export function useAllCampaigns() {
  const { campaigns: addresses, isLoading: loadingList } = useCampaigns();
  const contracts = addresses.flatMap((a) => {
    const c = campaignContract(a);
    return [
      { ...c, functionName: "angel" },
      { ...c, functionName: "poolTotal" },
      { ...c, functionName: "currentCohort" },
      { ...c, functionName: "totalShares" },
      { ...c, functionName: "rewardReserves" },
    ];
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading: loadingData } = useReadContracts({
    query: { enabled: addresses.length > 0 },
    contracts: contracts as any,
  });
  const results = data as ({ result?: unknown } | undefined)[] | undefined;

  const campaigns: Campaign[] = [];
  if (results) {
    addresses.forEach((a, i) => {
      const b = i * 5;
      campaigns.push(
        toCampaign(a, {
          angel: results[b]?.result as Addr,
          poolTotal: (results[b + 1]?.result as bigint) ?? 0n,
          currentCohort: (results[b + 2]?.result as bigint) ?? 0n,
          totalShares: (results[b + 3]?.result as bigint) ?? 0n,
          rewardReserves: (results[b + 4]?.result as bigint) ?? 0n,
        })
      );
    });
  }
  return { campaigns, isLoading: loadingList || loadingData };
}

/** A single campaign in the UI shape. */
export function useCampaignView(address?: Addr) {
  const { summary, isLoading } = useCampaignSummary(address);
  const campaign = address && summary ? toCampaign(address, summary) : undefined;
  return { campaign, isLoading };
}
