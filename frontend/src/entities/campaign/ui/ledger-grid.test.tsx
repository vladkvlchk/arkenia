import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TOKEN_SYMBOL } from "@/shared/config";
import { LedgerGrid, computeLayout } from "./ledger-grid";

/**
 * The grid claims that one square is worth a stated amount, and the legend
 * repeats that claim in words. If the layout picks a unit the drawing does not
 * honour — or escalates when it did not need to — the picture and its caption
 * disagree, and only the caption is checkable.
 *
 * The canvas itself is not asserted on: jsdom has no 2D context, and a pixel
 * comparison would fail on every design change without catching a wrong unit.
 */
describe("computeLayout grain", () => {
  // A small campaign should read as chunky tokens on a mostly blank page.
  it("picks the coarsest grain that fits the cell count", () => {
    const layout = computeLayout(400, 72, 1000, 0);

    expect(layout).toMatchObject({ unit: 100, cells: 10, cell: 20, gap: 3 });
  });

  it("steps the grain down as the campaign grows", () => {
    const coarse = computeLayout(400, 72, 1_000, 0)!;
    const fine = computeLayout(400, 72, 100_000, 0)!;

    expect(fine.cell).toBeLessThan(coarse.cell);
    expect(fine.unit).toBe(100);
  });

  /**
   * Once even the finest grain cannot hold the cell count, the unit escalates
   * by a factor of ten rather than the band overflowing or clipping. The legend
   * reads that unit back, so the escalation has to be exact.
   */
  it("escalates the unit by ten when the finest grain still will not fit", () => {
    const layout = computeLayout(400, 72, 50_000_000, 0)!;

    expect(layout.unit).toBeGreaterThan(100);
    expect(layout.unit % 100).toBe(0);
    expect(Math.log10(layout.unit / 100) % 1).toBe(0);
    expect(layout.cols * layout.rows).toBeGreaterThanOrEqual(layout.cells);
  });

  it("always leaves room for every cell it counted", () => {
    for (const raised of [300, 5_000, 120_000, 3_400_000, 90_000_000]) {
      const layout = computeLayout(400, 72, raised, 0)!;

      expect(layout).not.toBeNull();
      expect(layout.cols * layout.rows).toBeGreaterThanOrEqual(layout.cells);
    }
  });

  // A partial unit still occupies a whole square — capital that arrived is
  // shown, not rounded away.
  it("rounds a partial unit up to a whole square", () => {
    expect(computeLayout(400, 72, 101, 0)?.cells).toBe(2);
    expect(computeLayout(400, 72, 1, 0)?.cells).toBe(1);
  });

  it("draws nothing for a campaign with no deposits", () => {
    expect(computeLayout(400, 72, 0, 0)?.cells).toBe(0);
  });
});

describe("computeLayout returned capital", () => {
  it("hollows out the share of squares that were paid back", () => {
    const layout = computeLayout(400, 72, 1_000, 400)!;

    expect(layout.cells).toBe(10);
    expect(layout.returnedCells).toBe(4);
  });

  /**
   * A campaign can return more than it raised — that is the whole point of a
   * profitable one. The hollow count still cannot exceed the squares that
   * exist, or the grid would draw past its own end.
   */
  it("never hollows more squares than the grid holds", () => {
    const layout = computeLayout(400, 72, 1_000, 2_500)!;

    expect(layout.returnedCells).toBe(layout.cells);
  });

  it("hollows nothing before any capital comes back", () => {
    expect(computeLayout(400, 72, 1_000, 0)?.returnedCells).toBe(0);
  });
});

describe("computeLayout degenerate bands", () => {
  // The wrapper measures its container, and the first measurement on an
  // unmounted or hidden element is zero.
  it("declines to lay out a band with no room", () => {
    expect(computeLayout(0, 72, 1000, 0)).toBeNull();
    expect(computeLayout(400, 0, 1000, 0)).toBeNull();
    expect(computeLayout(4, 4, 1000, 0)).toBeNull();
  });
});

describe("LedgerGrid description", () => {
  /**
   * The canvas carries the whole figure, so its label is the only description a
   * screen reader gets — it has to state both amounts and what a square means.
   */
  it("describes the figure for assistive technology", () => {
    render(<LedgerGrid raised={1000} returned={400} />);

    const figure = screen.getByRole("img");
    // The symbol comes from config: it differs between the testnet and
    // mainnet contours, and a literal would fail the suite on one of them.
    expect(figure.getAttribute("aria-label")?.replace(/\s/g, " ")).toBe(
      `Raised 1 000 ${TOKEN_SYMBOL}, returned 400 ${TOKEN_SYMBOL}. ` +
        `One square represents 100 ${TOKEN_SYMBOL}.`
    );
  });

  it("omits the returned figure when nothing has come back", () => {
    render(<LedgerGrid raised={1000} />);

    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain("returned");
  });

  it("shows the unit in the legend as well as the label", () => {
    render(<LedgerGrid raised={1000} returned={400} />);

    expect(screen.getByText("returned")).toBeInTheDocument();
  });
});
