"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import type { Campaign, CampaignStatus, Cohort } from "@/entities/campaign/types";
import { campaignContract } from "../contracts";
import { campaignMeta } from "../metadata";
import { useCampaigns, useCampaignSummary, type CampaignSummary } from "./campaign";

type Addr = `0x${string}`;
const toNum = (x: bigint) => Number(formatUnits(x, 6));
const RAY = 10n ** 27n;
const ZERO = "0x0000000000000000000000000000000000000000" as Addr;

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
      const angel = results[b]?.result as Addr | undefined;
      if (!angel) return; // skip entries whose reads didn't resolve (RPC hiccup / non-campaign)
      campaigns.push(
        toCampaign(a, {
          angel,
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

/** A single campaign in the UI shape. Returns undefined once loaded if the address isn't a campaign. */
export function useCampaignView(address?: Addr) {
  const { summary, isLoading } = useCampaignSummary(address);
  const campaign = address && summary?.angel ? toCampaign(address, summary) : undefined;
  return { campaign, isLoading };
}

/** Per-cohort ledger for a viewer: supply, lifetime returned, your shares, your claimable. */
export function useCohortsView(address?: Addr, user?: Addr, currentCohort = 0n) {
  const n = Number(currentCohort);
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const c = address ? campaignContract(address) : undefined;
  const viewer = user ?? ZERO;
  const contracts = c
    ? [
        { ...c, functionName: "globalAccRay" },
        ...ids.flatMap((i) => [
          { ...c, functionName: "totalCohortShares", args: [BigInt(i)] },
          { ...c, functionName: "cohortAccRay", args: [BigInt(i)] },
          { ...c, functionName: "cohortSharesOf", args: [viewer, BigInt(i)] },
          { ...c, functionName: "pendingRewardOf", args: [viewer, [BigInt(i)]] },
        ]),
      ]
    : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useReadContracts({
    query: { enabled: !!address && n > 0 },
    contracts: contracts as any,
  });
  const r = data as ({ result?: unknown } | undefined)[] | undefined;

  const cohorts: Cohort[] = [];
  if (r && address) {
    const globalAcc = (r[0]?.result as bigint) ?? 0n;
    ids.forEach((i, k) => {
      const b = 1 + k * 4;
      const totalShares = (r[b]?.result as bigint) ?? 0n;
      const cohortAcc = (r[b + 1]?.result as bigint) ?? 0n;
      const yourShares = (r[b + 2]?.result as bigint) ?? 0n;
      const yourClaimable = (r[b + 3]?.result as bigint) ?? 0n;
      cohorts.push({
        campaignAddress: address,
        index: i,
        formedAt: "", // TODO(onchain): from the withdraw event timestamp (indexer)
        totalShares: toNum(totalShares),
        returned: toNum((totalShares * (cohortAcc + globalAcc)) / RAY),
        yourShares: toNum(yourShares),
        yourClaimable: toNum(yourClaimable),
      });
    });
  }
  return { cohorts, isLoading };
}
