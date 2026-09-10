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
import { type Campaign, type CampaignStatus } from "@/entities/campaign";
import { CampaignList, ViewSwitch, type CampaignView } from "@/widgets";
import { useAllCampaigns } from "@/lib/hooks/campaign-data";

// Live factory enumeration + on-chain summaries, filtered/sorted client-side.
// TODO(onchain): move search/sort/pagination server-side to an indexer once it exists —
// the URL state contract (q, status, sort, view, page) stays identical.

type Filter = "all" | CampaignStatus;
type Sort = "new" | "raised" | "returned" | "believers";

/**
 * Cards are for browsing, the table for comparing — so the table earns a denser page. Changing
 * view therefore changes what "page 3" means, which is why switching resets to the first page.
 */
const PAGE_SIZE: Record<CampaignView, number> = { cards: 12, table: 24 };

/** Survives a visit with no `view` param; an explicit param always wins over it. */
const VIEW_KEY = "arkenia:campaigns:view";

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
const isView = (v: string | null): v is CampaignView => v === "cards" || v === "table";

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
  const [view, setView] = useState<CampaignView>(
    isView(params.get("view")) ? (params.get("view") as CampaignView) : "cards"
  );

  const listTopRef = useRef<HTMLDivElement>(null);

  // The stored preference is read after mount, not during render: localStorage does not exist on
  // the server, and seeding state from it would hydrate a different view than was prerendered.
  // A `view` in the URL is an explicit choice and outranks it.
  useEffect(() => {
    if (isView(params.get("view"))) return;
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (isView(saved)) setView(saved);
    // Runs once: this restores an initial preference, and must not fight later user changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { campaigns: allCampaigns, isLoading } = useAllCampaigns();

  const results = useMemo(() => {
    const filtered = allCampaigns.filter(
      (c) => (filter === "all" || c.status === filter) && matches(c, query)
    );
    return [...filtered].sort(bySort[sort]);
  }, [allCampaigns, query, filter, sort]);

  const pageSize = PAGE_SIZE[view];
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageItems = results.slice((current - 1) * pageSize, current * pageSize);
  const rangeStart = (current - 1) * pageSize + 1;
  const rangeEnd = Math.min(current * pageSize, results.length);

  // The folio opening (featured split card) belongs to the untouched first page — and to the
  // card view alone, where it is a card. In the table it is simply row one.
  const showFeatured = view === "cards" && current === 1 && query.trim() === "";

  // Shareable URL state; replace (not push) so typing doesn't spam history. Defaults are omitted
  // so a plain /campaigns link stays clean.
  useEffect(() => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (filter !== "all") p.set("status", filter);
    if (sort !== "new") p.set("sort", sort);
    if (view !== "cards") p.set("view", view);
    if (current > 1) p.set("page", String(current));
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [query, filter, sort, view, current, pathname, router]);

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
  // Page 3 of 12-per-page is not page 3 of 24-per-page, so the page resets with the view.
  const viewTo = (v: CampaignView) => {
    setView(v);
    setPage(1);
    window.localStorage.setItem(VIEW_KEY, v);
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

      {/*
        Index toolbar — the reading-room reference desk. One line from lg up, where the filters,
        sort and view switch (~520px together) still leave the search a usable width; below that
        the search takes its own row rather than being squeezed to a stub.

        The search drops to h-10 on that single line — the compact control height DESIGN.md
        sanctions ("height 40 (compact) / 44 (default)") — so it sits level with the 36px
        segmented groups instead of towering over them.
      */}
      <div
        ref={listTopRef}
        className="mt-6 flex scroll-mt-24 flex-col gap-3 lg:flex-row lg:items-center"
      >
        <SearchField
          value={query}
          onChange={search}
          hotkey="/"
          placeholder="Search campaigns, angels, addresses…"
          aria-label="Search campaigns"
          className="lg:h-10 lg:min-w-0 lg:flex-1"
        />
        <div className="flex flex-wrap items-center gap-3">
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
          <ViewSwitch value={view} onChange={viewTo} />
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
        <div className="mt-6">
          <CampaignList
            campaigns={pageItems}
            view={view}
            sort={sort}
            onSortChange={sortTo}
            featureFirst={showFeatured}
          />
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
