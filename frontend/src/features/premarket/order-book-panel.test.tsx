import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OrderBook } from "@/entities/market";
import { OrderBookPanel } from "./order-book-panel";

/**
 * The book is read at a glance, so the two numbers that must be right are the
 * best price on each side and the spread between them. Both are derived, and a
 * derived price that is wrong looks exactly like a price that is right.
 */
const CAMPAIGN = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;

function book(overrides: Partial<OrderBook> = {}): OrderBook {
  return {
    campaignAddress: CAMPAIGN,
    cohortIndex: 2,
    bids: [
      { price: 1.2, size: 400 },
      { price: 1.15, size: 200 },
    ],
    asks: [
      { price: 1.3, size: 300 },
      { price: 1.35, size: 100 },
    ],
    ...overrides,
  };
}

describe("OrderBookPanel empty states", () => {
  it("invites the first order when the book has no levels", () => {
    render(<OrderBookPanel book={book({ bids: [], asks: [] })} />);

    expect(screen.getByText("No open orders for this cohort")).toBeInTheDocument();
  });

  // maxSize is derived with Math.max over both sides; on an empty book that is
  // -Infinity, and every depth bar would be sized from it.
  it("shows the empty state rather than a book with no data", () => {
    render(<OrderBookPanel />);

    expect(screen.getByText("No open orders for this cohort")).toBeInTheDocument();
    expect(screen.queryByText("Size")).not.toBeInTheDocument();
  });
});

describe("OrderBookPanel pricing", () => {
  it("quotes the best price on each side", () => {
    render(<OrderBookPanel book={book()} />);

    expect(screen.getAllByText("1.200")).not.toHaveLength(0);
    expect(screen.getAllByText("1.300")).not.toHaveLength(0);
  });

  /**
   * The spread is quoted against the mid price, not against either side.
   * (1.30 − 1.20) / 1.25 is 8.00%; against the bid it would read 8.33% and
   * against the ask 7.69% — all plausible, only one correct.
   */
  it("quotes the spread against the mid price", () => {
    render(<OrderBookPanel book={book()} />);

    expect(screen.getByText("spread 8.00%")).toBeInTheDocument();
  });

  // A one-sided book has no spread to quote, and rendering one from a missing
  // side would produce NaN.
  it("omits the spread when only one side has orders", () => {
    render(<OrderBookPanel book={book({ asks: [] })} />);

    expect(screen.queryByText(/spread/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("still lists the resting side of a one-sided book", () => {
    render(<OrderBookPanel book={book({ asks: [] })} />);

    expect(screen.getByText("Bid")).toBeInTheDocument();
    expect(screen.getAllByText("1.200")).not.toHaveLength(0);
  });
});

describe("OrderBookPanel depth", () => {
  // Depth is drawn relative to the largest level across both sides, so a level
  // reads the same width whichever side it sits on.
  it("scales each level against the deepest level in the book", () => {
    render(<OrderBookPanel book={book()} />);

    const levels = screen.getAllByRole("listitem");
    const widthOf = (index: number) =>
      levels[index]
        .querySelector<HTMLElement>("span[aria-hidden]")
        ?.style.getPropertyValue("--depth");

    // Deepest level is the 400-size bid; the 200-size bid is half of it.
    expect(widthOf(0)).toBe("100%");
    expect(widthOf(1)).toBe("50%");
  });

  it("lists every level given, on both sides", () => {
    render(<OrderBookPanel book={book()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});
