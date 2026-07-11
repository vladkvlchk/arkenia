"use client";

import { useEffect, useMemo, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { useToast } from "@/shared/ui";
import { fmtAmount } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import { campaignContract } from "@/lib/contracts";
import { activeChain } from "@/lib/config";
import type { AccountPosition } from "@/lib/api/client";

type Addr = `0x${string}`;

/**
 * Cross-campaign claim. CampaignV3.claim() is per-campaign, so "claim all" is a
 * sequence of transactions — one wallet signature per campaign, executed in order
 * and reported per step. A failure mid-run keeps everything already claimed.
 *
 * The API mirrors the chain with ~15s of indexer lag, so claimed amounts are
 * masked locally (per-campaign snapshots) until the backend reports a smaller
 * claimable than the snapshot — no stale "still claimable" flash, no flicker.
 */
export function useClaimAll(positions: AccountPosition[]) {
  const { toast } = useToast();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [claiming, setClaiming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** campaign (lowercase) → amount claimed this session, still unseen by the indexer. */
  const [claimedMask, setClaimedMask] = useState<ReadonlyMap<string, number>>(new Map());

  // Drop a mask entry once the indexer has caught up (server claimable dips below it).
  useEffect(() => {
    if (claimedMask.size === 0) return;
    let changed = false;
    const next = new Map(claimedMask);
    for (const p of positions) {
      const key = p.campaignAddress.toLowerCase();
      const snapshot = next.get(key);
      if (snapshot !== undefined && p.totalClaimable < snapshot) {
        next.delete(key);
        changed = true;
      }
    }
    if (changed) setClaimedMask(next);
  }, [positions, claimedMask]);

  /** Positions with locally-claimed amounts subtracted — render from these. */
  const masked = useMemo(
    () =>
      positions.map((p) => {
        const snapshot = claimedMask.get(p.campaignAddress.toLowerCase());
        if (snapshot === undefined) return p;
        return { ...p, totalClaimable: Math.max(0, p.totalClaimable - snapshot) };
      }),
    [positions, claimedMask]
  );

  const targets = useMemo(
    () =>
      masked
        .filter((p) => p.totalClaimable > 0)
        .map((p) => ({
          campaign: p.campaignAddress as Addr,
          name: p.campaignName,
          amount: p.totalClaimable,
          // Cohorts with pending rewards; an empty list still pays out the
          // account's realised-but-unclaimed bucket (contract allows claim([])).
          cohortIds: p.cohorts.filter((c) => c.claimable > 0).map((c) => BigInt(c.index)),
        })),
    [masked]
  );

  async function claimAll() {
    if (targets.length === 0 || claiming) return;
    setClaiming(true);
    let done = 0;
    setProgress({ done, total: targets.length });
    try {
      for (const target of targets) {
        const txHash = await writeContractAsync({
          ...campaignContract(target.campaign),
          functionName: "claim",
          args: [target.cohortIds],
          chainId: activeChain.id,
        });
        await publicClient?.waitForTransactionReceipt({ hash: txHash });
        setClaimedMask((prev) => {
          const key = target.campaign.toLowerCase();
          return new Map(prev).set(key, (prev.get(key) ?? 0) + target.amount);
        });
        done += 1;
        setProgress({ done, total: targets.length });
        toast({
          title: `Claimed ${fmtAmount(target.amount)} ${TOKEN_SYMBOL}`,
          description: target.name,
          intent: "success",
          txHash,
        });
      }
    } catch (e) {
      const reason =
        (e as { shortMessage?: string }).shortMessage ??
        (e instanceof Error ? e.message : "The transaction was rejected.");
      toast({
        title: done > 0 ? `Claim stopped after ${done} of ${targets.length}` : "Claim failed",
        description: reason,
        intent: "danger",
      });
    } finally {
      setClaiming(false);
      setProgress(null);
    }
  }

  return {
    /** Positions to render (claimed amounts masked until the indexer catches up). */
    positions: masked,
    claimAll,
    claiming,
    /** Non-null while claiming: { done, total } for "Claiming k/n…" labels. */
    progress,
    /** How many wallet signatures a full claim needs right now. */
    txCount: targets.length,
  };
}
