"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** 1 … page±1 … last — at most seven slots, stable while paging through the middle. */
function pageWindow(page: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const wanted = new Set([1, count, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => wanted.add(p));
  if (page >= count - 2) [count - 3, count - 2, count - 1].forEach((p) => wanted.add(p));
  const pages = [...wanted].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Folio pagination: quiet mono numbers, the current page a solid ink cell —
 * the same mark the ledger grid uses for money that has arrived.
 */
export function Pagination({ page, pageCount, onPageChange, className }: PaginationProps) {
  if (pageCount <= 1) return null;
  const go = (p: number) => {
    if (p >= 1 && p <= pageCount && p !== page) onPageChange(p);
  };

  return (
    <nav aria-label="Pagination" className={cn("flex items-center gap-1", className)}>
      <PageButton disabled={page === 1} onClick={() => go(page - 1)} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </PageButton>

      {/* Compact readout on narrow screens; the full window from sm up. */}
      <span className="mx-1 font-mono text-xs tabular-nums text-ink sm:hidden">
        {page} / {pageCount}
      </span>
      <div className="hidden items-center gap-1 sm:flex">
        {pageWindow(page, pageCount).map((p, i) =>
          p === "…" ? (
            <span
              key={`gap-${i}`}
              aria-hidden
              className="w-8 select-none text-center font-mono text-xs text-ink-faint"
            >
              …
            </span>
          ) : (
            <PageButton
              key={p}
              current={p === page}
              onClick={() => go(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </PageButton>
          )
        )}
      </div>

      <PageButton disabled={page === pageCount} onClick={() => go(page + 1)} aria-label="Next page">
        <ChevronRight className="h-4 w-4" aria-hidden />
      </PageButton>
    </nav>
  );
}

function PageButton({
  current = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { current?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-sm px-1 font-mono text-xs tabular-nums",
        "transition-colors duration-150",
        current
          ? "bg-accent text-accent-on"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
        "disabled:pointer-events-none disabled:text-ink-faint",
        className
      )}
      {...props}
    />
  );
}
