import { Card, CardHeader, CardTitle, EmptyState } from "@/shared/ui";
import { BookOpen } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { OrderBook, OrderLevel } from "@/entities/market";

/**
 * Two-sided per-cohort book. Depth is drawn as quiet background bars —
 * proportional, unanimated, honest.
 */
export function OrderBookPanel({ book }: { book?: OrderBook }) {
  if (!book || (book.bids.length === 0 && book.asks.length === 0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order book</CardTitle>
        </CardHeader>
        <EmptyState
          icon={BookOpen}
          title="No open orders for this cohort"
          description="Place the first bid or ask — orders rest onchain until filled or cancelled."
        />
      </Card>
    );
  }

  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  const spread =
    bestBid !== undefined && bestAsk !== undefined
      ? (((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100).toFixed(2)
      : undefined;
  const maxSize = Math.max(...[...book.bids, ...book.asks].map((l) => l.size));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order book</CardTitle>
        <span className="t-overline">Price in {TOKEN_SYMBOL} / share</span>
      </CardHeader>
      <div className="grid grid-cols-2">
        <BookSide side="bid" levels={book.bids} maxSize={maxSize} />
        <BookSide side="ask" levels={book.asks} maxSize={maxSize} className="border-l border-line" />
      </div>
      <div className="flex items-center justify-center gap-3 border-t border-line px-4 py-2.5 font-mono text-xs text-ink-muted">
        {bestBid !== undefined && <span className="text-success">{bestBid.toFixed(3)}</span>}
        <span aria-hidden className="text-ink-faint">/</span>
        {bestAsk !== undefined && <span className="text-danger">{bestAsk.toFixed(3)}</span>}
        {spread && <span className="text-ink-subtle">spread {spread}%</span>}
      </div>
    </Card>
  );
}

function BookSide({
  side,
  levels,
  maxSize,
  className,
}: {
  side: "bid" | "ask";
  levels: OrderLevel[];
  maxSize: number;
  className?: string;
}) {
  const isBid = side === "bid";
  return (
    <div className={className}>
      <div
        className={cn(
          "flex justify-between px-4 py-2 text-2xs font-medium uppercase tracking-[0.08em] text-ink-subtle",
          !isBid && "flex-row-reverse"
        )}
      >
        <span>Size</span>
        <span>{isBid ? "Bid" : "Ask"}</span>
      </div>
      <ul>
        {levels.map((level) => (
          <li
            key={level.price}
            className={cn(
              "relative flex items-center justify-between px-4 py-1.5 font-mono text-[13px]",
              !isBid && "flex-row-reverse"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0.5 w-[var(--depth)] rounded-sm",
                isBid ? "right-0 bg-success-soft" : "left-0 bg-danger-soft"
              )}
              style={{ "--depth": `${(level.size / maxSize) * 100}%` } as React.CSSProperties}
            />
            <span className="relative text-ink-muted">{fmtNum(level.size)}</span>
            <span className={cn("relative font-medium", isBid ? "text-success" : "text-danger")}>
              {level.price.toFixed(3)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
