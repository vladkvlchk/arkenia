import { ArrowDownLeft, CornerDownLeft, ExternalLink, HandCoins, Layers, Undo2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AddressChip, Card, CardHeader, CardTitle, EmptyState, TokenAmount } from "@/shared/ui";
import { fmtDateTime } from "@/shared/lib/format";
import { explorerTxUrl } from "@/shared/config";
import type { ActivityItem, ActivityType } from "@/entities/campaign";
import { Activity } from "lucide-react";

const typeConfig: Record<ActivityType, { icon: LucideIcon; label: (i: ActivityItem) => string }> = {
  deposit: { icon: ArrowDownLeft, label: () => "Deposit to pool" },
  withdraw: { icon: Layers, label: (i) => `Cohort #${i.cohortIndex} minted` },
  return: { icon: CornerDownLeft, label: (i) => `Return to Cohort #${i.cohortIndex}` },
  claim: { icon: HandCoins, label: (i) => `Claim from Cohort #${i.cohortIndex}` },
  refund: { icon: Undo2, label: () => "Pool refund" },
};

/** Chronological, verifiable event list — every row links to its transaction. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <span className="t-overline">Onchain events</span>
      </CardHeader>
      {items.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity yet"
          description="Deposits, cohort mints, returns and claims will appear here as they land onchain."
        />
      ) : (
        <ul>
          {items.map((item) => {
            const { icon: Icon, label } = typeConfig[item.type];
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-0"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2/70">
                  <Icon className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink">{label(item)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-subtle">
                    <AddressChip address={item.actor} variant="plain" explorer={false} />
                    <span aria-hidden>·</span>
                    <time dateTime={item.at}>{fmtDateTime(item.at)}</time>
                  </div>
                </div>
                <TokenAmount value={item.amount} className="shrink-0 text-[13px]" />
                <a
                  href={explorerTxUrl(item.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View transaction on explorer"
                  className="shrink-0 rounded-sm p-1 text-ink-faint transition-colors duration-150 hover:text-ink"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
