"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Plus, SearchX } from "lucide-react";
import {
  Button,
  Container,
  EmptyState,
  Pagination,
  SearchField,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { fmtNum } from "@/shared/lib/format";
import { CampaignCard, type Campaign, type CampaignStatus } from "@/entities/campaign";
import { useAllCampaigns } from "@/lib/hooks/campaign-data";

// Live factory enumeration + on-chain summaries, filtered/sorted client-side.
// TODO(onchain): move search/sort/pagination server-side to an indexer once it exists —
// the URL state contract (q, status, sort, page) stays identical.

type Filter = "all" | CampaignStatus;
type Sort = "new" | "raised" | "returned" | "believers";

const PAGE_SIZE = 12;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "returning", label: "Returning" },
  { value: "closed", label: "Closed" },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "new", label: "Newest" },
  { value: "raised", label: "Most raised" },
  { value: "returned", label: "Most returned" },
  { value: "believers", label: "Most believers" },
];

const bySort: Record<Sort, (a: Campaign, b: Campaign) => number> = {
  new: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  raised: (a, b) => b.totalDeposited - a.totalDeposited,
  returned: (a, b) => b.totalReturned - a.totalReturned,
  believers: (a, b) => b.believers - a.believers,
};

function matches(c: Campaign, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    c.name.toLowerCase().includes(q) ||
    c.description.toLowerCase().includes(q) ||
    (c.angel.label?.toLowerCase().includes(q) ?? false) ||
    c.address.toLowerCase().includes(q) ||
    c.angel.address.toLowerCase().includes(q)
  );
}

const isFilter = (v: string | null): v is Filter =>
  v !== null && FILTERS.some((f) => f.value === v);
const isSort = (v: string | null): v is Sort => v !== null && SORTS.some((s) => s.value === v);

export default function CampaignsPage() {
  // useSearchParams needs a Suspense boundary for static prerender.
  return (
    <Suspense fallback={<Container className="py-10" />}>
      <CampaignsIndex />
    </Suspense>
  );
}

function CampaignsIndex() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState<Filter>(isFilter(params.get("status")) ? params.get("status") as Filter : "all");
  const [sort, setSort] = useState<Sort>(isSort(params.get("sort")) ? (params.get("sort") as Sort) : "new");
  const [page, setPage] = useState(Math.max(1, Number(params.get("page")) || 1));

  const listTopRef = useRef<HTMLDivElement>(null);

  const { campaigns: allCampaigns, isLoading } = useAllCampaigns();

  const results = useMemo(() => {
    const filtered = allCampaigns.filter(
      (c) => (filter === "all" || c.status === filter) && matches(c, query)
    );
    return [...filtered].sort(bySort[sort]);
  }, [allCampaigns, query, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageItems = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const rangeStart = (current - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(current * PAGE_SIZE, results.length);

  // The folio opening (featured split card) belongs to the untouched first page.
  const showFeatured = current === 1 && query.trim() === "";

  // Shareable URL state; replace (not push) so typing doesn't spam history.
  useEffect(() => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (filter !== "all") p.set("status", filter);
    if (sort !== "new") p.set("sort", sort);
    if (current > 1) p.set("page", String(current));
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [query, filter, sort, current, pathname, router]);

  const search = (v: string) => {
    setQuery(v);
    setPage(1);
  };
  const filterTo = (v: Filter) => {
    setFilter(v);
    setPage(1);
  };
  const sortTo = (v: Sort) => {
    setSort(v);
    setPage(1);
  };
  const goToPage = (p: number) => {
    setPage(p);
    listTopRef.current?.scrollIntoView({ block: "start" });
  };

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">Campaigns</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {fmtNum(allCampaigns.length)} campaigns · deposits are refundable until deployed.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/create">
            <Plus className="h-4 w-4" aria-hidden />
            New campaign
          </Link>
        </Button>
      </div>

      {/* Index toolbar — the reading-room reference desk. */}
      <div ref={listTopRef} className="mt-6 scroll-mt-24 space-y-3">
        <SearchField
          value={query}
          onChange={search}
          hotkey="/"
          placeholder="Search campaigns, angels, addresses…"
          aria-label="Search campaigns"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={filter} onValueChange={(v) => filterTo(v as Filter)}>
            <TabsList variant="segmented">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <SortSelect value={sort} onChange={sortTo} />
        </div>
      </div>

      {isLoading && allCampaigns.length === 0 ? (
        <div className="mt-6 rounded-lg border border-line bg-surface p-12 text-center text-[13px] text-ink-muted">
          Loading campaigns…
        </div>
      ) : results.length === 0 ? (
        <div className="mt-6 rounded-lg border border-line bg-surface">
          <EmptyState
            icon={SearchX}
            title={query ? `No matches for “${query.trim()}”` : `No ${filter} campaigns`}
            description="Try another name, angel or address — or clear the search to see the whole index."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  search("");
                  filterTo("all");
                }}
              >
                Clear search
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {showFeatured && (
            <CampaignCard campaign={pageItems[0]} variant="split" featured />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {(showFeatured ? pageItems.slice(1) : pageItems).map((c) => (
              <CampaignCard key={c.address} campaign={c} />
            ))}
          </div>
        </div>
      )}

      {/* Folio line: where you are in the index. */}
      {results.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="t-overline">
            {fmtNum(rangeStart)}–{fmtNum(rangeEnd)} of {fmtNum(results.length)}
            {query.trim() && ` for “${query.trim()}”`}
          </span>
          <Pagination page={current} pageCount={pageCount} onPageChange={goToPage} />
        </div>
      )}
    </Container>
  );
}

function SortSelect({ value, onChange }: { value: Sort; onChange: (v: Sort) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="t-overline">Sort</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as Sort)}
          className="h-8 cursor-pointer appearance-none rounded-md border border-transparent bg-transparent pl-2 pr-7 text-[13px] font-medium text-ink transition-colors duration-150 hover:border-line focus:border-line-strong focus:outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
      </span>
    </label>
  );
}
