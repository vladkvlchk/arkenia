"use client";

import { ChevronDown } from "lucide-react";
import { Table, TableContainer, TBody, Th, THead, Tr } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { CampaignCard, CampaignRow, type Campaign } from "@/entities/campaign";
import type { CampaignView } from "./view-switch";

/** The sort keys the index already understands; every one is descending. */
export type CampaignSort = "new" | "raised" | "returned" | "believers";

export interface CampaignListProps {
  campaigns: Campaign[];
  view: CampaignView;
  sort: CampaignSort;
  onSortChange: (sort: CampaignSort) => void;
  /**
   * Promotes the first campaign into a full-width split card. Cards only — in the table it is
   * an ordinary row, and dropping it there would silently lose a campaign from the page.
   */
  featureFirst?: boolean;
}

/**
 * One page of campaigns, as cards or as a table. Both render the same already-filtered, sorted,
 * paginated array — the view decides presentation only, never which campaigns you see.
 */
export function CampaignList({
  campaigns,
  view,
  sort,
  onSortChange,
  featureFirst = false,
}: CampaignListProps) {
  if (view === "table") {
    return <CampaignTable campaigns={campaigns} sort={sort} onSortChange={onSortChange} />;
  }

  return (
    <div className="space-y-4">
      {featureFirst && campaigns.length > 0 && (
        <CampaignCard campaign={campaigns[0]} variant="split" featured />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {(featureFirst ? campaigns.slice(1) : campaigns).map((c) => (
          <CampaignCard key={c.address} campaign={c} />
        ))}
      </div>
    </div>
  );
}

/**
 * Only the four columns the index can actually sort by are buttons. The rest are plain headers:
 * a header that looks clickable and does nothing is worse than one that never invited the click.
 * Ascending order is deliberately not offered — the whole index is descending, and a direction
 * flag would have to reach the URL contract to stay shareable.
 */
const COLUMNS: {
  label: string;
  sort?: CampaignSort;
  numeric?: boolean;
  className?: string;
}[] = [
  { label: "Campaign" },
  { label: "Status" },
  { label: "Raised", sort: "raised", numeric: true },
  { label: "Returned", sort: "returned", numeric: true },
  { label: "Multiple", numeric: true },
  { label: "Believers", sort: "believers", numeric: true },
  { label: "Cohorts", numeric: true, className: "hidden lg:table-cell" },
  { label: "Angel", className: "hidden md:table-cell" },
  { label: "Created", sort: "new", className: "hidden lg:table-cell" },
];

function CampaignTable({
  campaigns,
  sort,
  onSortChange,
}: Pick<CampaignListProps, "campaigns" | "sort" | "onSortChange">) {
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr className="hover:bg-transparent">
            {COLUMNS.map((col) => {
              const active = col.sort !== undefined && col.sort === sort;
              return (
                <Th
                  key={col.label}
                  scope="col"
                  numeric={col.numeric}
                  className={col.className}
                  // Every sort here is descending, so an active column is always descending.
                  aria-sort={active ? "descending" : undefined}
                >
                  {col.sort ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(col.sort as CampaignSort)}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors duration-150 hover:text-ink",
                        col.numeric && "flex-row-reverse",
                        active && "text-ink"
                      )}
                    >
                      {col.label}
                      <ChevronDown
                        className={cn("h-3 w-3", active ? "opacity-100" : "opacity-0")}
                        aria-hidden
                      />
                    </button>
                  ) : (
                    col.label
                  )}
                </Th>
              );
            })}
            <Th scope="col" aria-label="Open" />
          </Tr>
        </THead>
        <TBody>
          {campaigns.map((c) => (
            <CampaignRow key={c.address} campaign={c} />
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}
