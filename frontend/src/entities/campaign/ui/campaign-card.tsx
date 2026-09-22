import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AddressChip, Card } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { fmtDate, fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { Campaign } from "../types";
import { CampaignStatusBadge } from "./campaign-status-badge";
import { CampaignBanner } from "./campaign-banner";
import { LedgerGrid } from "./ledger-grid";

export type CampaignCardVariant = "banner" | "split";

export interface CampaignCardProps {
  campaign: Campaign;
  /** "banner": full-width frontispiece on top. "split": half-width plate column. */
  variant?: CampaignCardVariant;
  /** Featured-by-infill per DESIGN.md — tonal lift, never a border or shadow. */
  featured?: boolean;
}

/** List-view card. Explicit CTA — the whole card is not a link (chips and the grid are interactive). */
export function CampaignCard({ campaign, variant = "banner", featured = false }: CampaignCardProps) {
  return variant === "split" ? (
    <SplitCard campaign={campaign} featured={featured} />
  ) : (
    <BannerCard campaign={campaign} featured={featured} />
  );
}

function BannerCard({ campaign, featured }: { campaign: Campaign; featured: boolean }) {
  const href = `/campaign/${campaign.address}`;
  return (
    <Card
      className={cn(
        "group relative flex flex-col overflow-hidden transition-colors duration-200 hover:border-line-strong",
        featured && "bg-surface-2"
      )}
    >
      <Link href={href} tabIndex={-1} aria-hidden className="block">
        <CampaignBanner
          name={campaign.name}
          coverUrl={campaign.coverUrl}
          className={cn("aspect-[21/9] w-full border-b border-line", featured && "bg-surface")}
        />
      </Link>
      <div className="absolute right-3 top-3">
        <CampaignStatusBadge status={campaign.status} />
      </div>

      <div className="p-5 pb-4">
        <Link
          href={href}
          className="block truncate text-[15px] font-semibold text-ink hover:underline hover:underline-offset-4"
        >
          {campaign.name}
        </Link>
        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-ink-muted">
          {campaign.description}
        </p>
      </div>

      <div className="px-5 pb-5">
        <StatRow campaign={campaign} />
        <LedgerGrid
          raised={campaign.totalDeposited}
          returned={campaign.totalReturned}
          height={72}
          className="mt-4"
        />
      </div>

      <CardFoot campaign={campaign} />

      <span className="sr-only">
        Amounts denominated in {TOKEN_SYMBOL}. {campaign.cohortCount} cohorts.
      </span>
    </Card>
  );
}

function SplitCard({ campaign, featured }: { campaign: Campaign; featured: boolean }) {
  const href = `/campaign/${campaign.address}`;
  return (
    <Card
      className={cn(
        "group grid overflow-hidden transition-colors duration-200 hover:border-line-strong md:grid-cols-[5fr_7fr]",
        featured && "bg-surface-2"
      )}
    >
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden
        className="relative block aspect-[21/9] border-b border-line md:aspect-auto md:border-b-0 md:border-r"
      >
        <CampaignBanner
          name={campaign.name}
          coverUrl={campaign.coverUrl}
          className={cn("absolute inset-0", featured && "bg-surface")}
        />
      </Link>

      <div className="flex min-w-0 flex-col">
        <div className="p-6 pb-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <CampaignStatusBadge status={campaign.status} />
            <span className="text-xs text-ink-subtle">
              {campaign.believers} {campaign.believers === 1 ? "believer" : "believers"} · since{" "}
              {fmtDate(campaign.createdAt)}
            </span>
          </div>
          <h3 className="mt-3 font-serif text-2xl leading-tight tracking-[-0.01em] text-ink">
            <Link href={href} className="hover:underline hover:underline-offset-4">
              {campaign.name}
            </Link>
          </h3>
          <p className="mt-2 line-clamp-2 max-w-[60ch] text-[13px] leading-5 text-ink-muted">
            {campaign.description}
          </p>
        </div>

        <div className="p-6 pt-5">
          <StatRow campaign={campaign} large />
          <LedgerGrid
            raised={campaign.totalDeposited}
            returned={campaign.totalReturned}
            height={72}
            className="mt-4"
          />
        </div>

        <CardFoot campaign={campaign} className="px-6" />
      </div>

      <span className="sr-only">
        Amounts denominated in {TOKEN_SYMBOL}. {campaign.cohortCount} cohorts.
      </span>
    </Card>
  );
}

function StatRow({ campaign, large = false }: { campaign: Campaign; large?: boolean }) {
  // Realised multiple only once the story is finished — mid-flight it reads as a verdict.
  const multiple =
    campaign.status === "closed" && campaign.totalWithdrawn > 0
      ? (campaign.totalReturned / campaign.totalWithdrawn).toFixed(2)
      : null;

  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="t-overline">Raised</div>
        <div className={cn("mt-1 font-mono leading-none text-ink", large ? "text-xl" : "text-lg")}>
          {fmtNum(campaign.totalDeposited)}
        </div>
      </div>
      <div className="flex shrink-0 items-end gap-5 text-right">
        <div>
          <div className="t-overline">Returned</div>
          <div
            className={cn(
              "mt-1 font-mono text-[13px] leading-none",
              campaign.totalReturned > 0 ? "text-ink" : "text-ink-faint"
            )}
          >
            {fmtNum(campaign.totalReturned)}
            {multiple && <span className="ml-1 text-2xs text-ink-subtle">{multiple}×</span>}
          </div>
        </div>
        <div>
          <div className="t-overline">Believers</div>
          <div className="mt-1 font-mono text-[13px] leading-none text-ink">
            {campaign.believers}
          </div>
        </div>
      </div>
    </div>
  );
}

function CardFoot({ campaign, className }: { campaign: Campaign; className?: string }) {
  return (
    <div
      className={cn(
        "mt-auto flex items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-5 py-3",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs text-ink-subtle">
        <span className="shrink-0">Angel</span>
        <AddressChip
          address={campaign.angel.address}
          label={campaign.angel.label}
          variant="plain"
          explorer={false}
        />
      </div>
      <Link
        href={`/campaign/${campaign.address}`}
        className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
      >
        View
        <ArrowUpRight
          className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-px group-hover:-translate-y-px"
          aria-hidden
        />
      </Link>
    </div>
  );
}
