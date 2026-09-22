import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AddressChip, Td, Tr } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { fmtDate, fmtNum } from "@/shared/lib/format";
import type { Campaign } from "../types";
import { CampaignStatusBadge } from "./campaign-status-badge";
import { CampaignMonogram } from "./campaign-monogram";

/**
 * One campaign as a table row — the dense counterpart to CampaignCard, for comparing figures
 * down a column rather than reading campaigns one at a time.
 *
 * The name is the link, not the row. A row-level click handler would cost text selection,
 * middle-click and keyboard navigation, and the row already carries two other interactive
 * targets (the angel chip and the open link).
 */
export function CampaignRow({ campaign }: { campaign: Campaign }) {
  const href = `/campaign/${campaign.address}`;

  // Realised multiple only once the story is finished — mid-flight it reads as a verdict.
  // Mirrors CampaignCard's StatRow so the two views never disagree.
  const multiple =
    campaign.status === "closed" && campaign.totalWithdrawn > 0
      ? `${(campaign.totalReturned / campaign.totalWithdrawn).toFixed(2)}×`
      : null;

  return (
    <Tr className="group">
      <Td className="max-w-0 min-w-[14rem]">
        <div className="flex items-center gap-3">
          <CampaignMonogram
            name={campaign.name}
            coverUrl={campaign.coverUrl}
            size="sm"
            className="hidden shrink-0 sm:block"
          />
          <Link
            href={href}
            className="truncate font-medium text-ink hover:underline hover:underline-offset-4"
          >
            {campaign.name}
          </Link>
        </div>
      </Td>

      <Td>
        <CampaignStatusBadge status={campaign.status} />
      </Td>

      <Td numeric>{fmtNum(campaign.totalDeposited)}</Td>

      <Td numeric className={cn(campaign.totalReturned === 0 && "text-ink-faint")}>
        {fmtNum(campaign.totalReturned)}
      </Td>

      <Td numeric className={cn(!multiple && "text-ink-faint")}>
        {multiple ?? "—"}
      </Td>

      <Td numeric>{fmtNum(campaign.believers)}</Td>

      {/* Below md these three are the first to go: the table scrolls inside its own container,
          but a phone reading four columns beats a phone dragging nine sideways. */}
      <Td numeric className="hidden lg:table-cell">
        {fmtNum(campaign.cohortCount)}
      </Td>

      <Td className="hidden md:table-cell">
        <AddressChip
          address={campaign.angel.address}
          label={campaign.angel.label}
          variant="plain"
          explorer={false}
        />
      </Td>

      <Td className="hidden text-ink-muted lg:table-cell">{fmtDate(campaign.createdAt)}</Td>

      <Td>
        <Link
          href={href}
          aria-label={`Open ${campaign.name}`}
          className="inline-flex text-ink-subtle transition-colors duration-150 hover:text-accent"
        >
          <ArrowUpRight
            className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-px group-hover:-translate-y-px"
            aria-hidden
          />
        </Link>
      </Td>
    </Tr>
  );
}
