"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import type { Campaign, CampaignStatus, Cohort } from "@/entities/campaign";
import { API_ENABLED } from "@/shared/config";
import { campaignContract } from "../contracts";
import { campaignMeta, seedMeta } from "../metadata";
import { useCampaigns, useCampaignSummary, type CampaignSummary } from "./campaign";
import { useApiCampaign, useApiCampaigns, useApiCampaignMetadata } from "./api";

type Addr = `0x${string}`;
const toNum = (x: bigint) => Number(formatUnits(x, 6));
const RAY = 10n ** 27n;
const ZERO = "0x0000000000000000000000000000000000000000" as Addr;

/**
 * Builds the UI `Campaign` shape from on-chain reads + off-chain metadata. This is the FALLBACK
 * path — used when the indexer/API is unreachable. Exact from-chain: poolBalance, totalWithdrawn
 * (== totalShares), cohortCount. Derived: totalDeposited = pool + deployed; totalReturned uses
 * rewardReserves (== lifetime returned until the first claim). believers/createdAt are unknown
 * without the indexer, so they read 0 / now until the API answers.
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

/**
 * The four seeded demo campaigns keep their hardcoded names until their metadata is persisted
 * server-side; every other campaign takes whatever the backend stored.
 */
function withSeedOverride(c: Campaign): Campaign {
  const seed = seedMeta(c.address);
  return seed
    ? { ...c, name: seed.name, description: seed.description, coverUrl: seed.coverUrl ?? c.coverUrl }
    : c;
}

/** On-chain campaign list (fallback source). `enabled=false` skips the per-campaign multicall. */
function useAllCampaignsOnchain(enabled: boolean) {
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
  const { data, isLoading: loadingData } = useReadContracts({
    query: { enabled: enabled && addresses.length > 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return { campaigns, isLoading: (enabled && loadingList) || loadingData };
}

/**
 * All campaigns, API-first with an on-chain fallback. The indexer answer carries real names,
 * believer counts and creation times; the on-chain path renders instantly and covers the case
 * where the backend is still syncing or down.
 */
export function useAllCampaigns() {
  const apiQ = useApiCampaigns();
  const apiHas = API_ENABLED && !apiQ.isError && !!apiQ.data && apiQ.data.length > 0;
  const chain = useAllCampaignsOnchain(!apiHas);
  if (apiHas) return { campaigns: apiQ.data!.map(withSeedOverride), isLoading: false };
  return { campaigns: chain.campaigns, isLoading: chain.isLoading };
}

/**
 * A single campaign for the detail page, drawing each figure from the source that can actually
 * answer it:
 *
 *   chain   — pool, deployed, cohort count. These change the moment a tx confirms, and this is
 *             the page people transact on, so they must not wait on an indexer poll.
 *   indexer — lifetime deposited/returned, believers, createdAt. The chain has no cheap answer:
 *             `rewardReserves` is returned *minus claimed*, so reading it as "returned"
 *             under-reports by every claim ever made — a campaign that had returned 210 read
 *             0.000001 once its believer claimed. `pool + deployed` likewise under-reports
 *             lifetime deposits by everything since refunded. believers/createdAt have no
 *             on-chain source at all.
 *
 * Losing the API degrades to exactly the on-chain-only campaign this used to build; losing the
 * chain reads still renders, from the indexed record alone.
 */
export function useCampaignView(address?: Addr) {
  const { summary, isLoading } = useCampaignSummary(address);
  const apiQ = useApiCampaign(address);
  const metaQ = useApiCampaignMetadata(address);

  const chain = address && summary?.angel ? toCampaign(address, summary) : undefined;
  const indexed = apiQ.data?.campaign;

  // Indexed record as the base — the chain overlays only what it answers more currently.
  let base: Campaign | undefined;
  if (indexed && chain) {
    base = {
      ...indexed,
      poolBalance: chain.poolBalance,
      totalWithdrawn: chain.totalWithdrawn,
      cohortCount: chain.cohortCount,
      status: chain.status,
    };
  } else {
    base = chain ?? indexed;
  }

  let campaign = base;
  if (base) {
    const seed = seedMeta(base.address);
    if (seed) {
      campaign = { ...base, name: seed.name, description: seed.description, coverUrl: seed.coverUrl ?? base.coverUrl };
    } else if (metaQ.data && new Date(metaQ.data.updatedAt).getTime() > 0) {
      const m = metaQ.data;
      campaign = { ...base, name: m.name, description: m.description, coverUrl: m.coverUrl ?? base.coverUrl };
    }
  }
  return { campaign, isLoading: isLoading && !campaign };
}

/**
 * Per-cohort ledger for a viewer: supply, lifetime returned, your shares, your claimable.
 *
 * Every figure here is read from the chain so a viewer's own numbers are never a poll behind.
 * The one exception is `formedAt`: a cohort's formation time lives in the Withdrawn event, not
 * in contract state, so it can only come from the indexer.
 */
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

  const apiQ = useApiCampaign(address);
  const formedAt = new Map((apiQ.data?.cohorts ?? []).map((c) => [c.index, c.formedAt]));

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
        // Empty without the indexer — fmtDate renders that as "—" rather than "Invalid Date".
        formedAt: formedAt.get(i) ?? "",
        index: i,
        totalShares: toNum(totalShares),
        returned: toNum((totalShares * (cohortAcc + globalAcc)) / RAY),
        yourShares: toNum(yourShares),
        yourClaimable: toNum(yourClaimable),
      });
    });
  }
  return { cohorts, isLoading };
}
