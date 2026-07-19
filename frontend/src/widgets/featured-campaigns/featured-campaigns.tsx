"use client";

import Link from "next/link";
import { Button } from "@/shared/ui";
import { CampaignCard } from "@/entities/campaign";
import { useAllCampaigns } from "@/lib/hooks/campaign-data";

/**
 * Homepage "Open now" strip — real campaigns from the indexer/factory (API-first, on-chain
 * fallback). Prefers open campaigns, falls back to the latest few; clean empty state when there
 * are none (e.g. a freshly-deployed mainnet) instead of misleading mock cards.
 */
export function FeaturedCampaigns() {
  const { campaigns, isLoading } = useAllCampaigns();
  const open = campaigns.filter((c) => c.status === "open");
  const featured = (open.length > 0 ? open : campaigns).slice(0, 3);

  if (isLoading && campaigns.length === 0) {
    return (
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-lg border border-line bg-surface-2/40" />
        ))}
      </div>
    );
  }

  if (featured.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed border-line-strong bg-surface p-10 text-center">
        <p className="text-[13px] text-ink-muted">No open campaigns yet — be the first to start one.</p>
        <Button className="mt-4" size="sm" asChild>
          <Link href="/create">Create a campaign</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {featured.map((c) => (
        <CampaignCard key={c.address} campaign={c} />
      ))}
    </div>
  );
}
