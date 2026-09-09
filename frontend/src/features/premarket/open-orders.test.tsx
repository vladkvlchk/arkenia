import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OpenOrder } from "@/entities/market";
import { OpenOrders } from "./open-orders";

/**
 * A presentational table, so most of it is not worth asserting on. What is:
 * cancelling costs a transaction, and the control that triggers it has to name
 * which order it will cancel — a row of identical unlabelled buttons is both
 * unusable with a screen reader and untestable without relying on row order.
 */
const CAMPAIGN = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;

function order(overrides: Partial<OpenOrder> & { id: string }): OpenOrder {
  return {
    campaignAddress: CAMPAIGN,
    campaignName: "Aurora Compute",
    cohortIndex: 2,
    side: "bid",
    price: 1.25,
    size: 100,
    filled: 0,
    placedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("OpenOrders listing", () => {
  it("explains the empty state instead of showing a bare table", () => {
    render(<OpenOrders orders={[]} />);

    expect(screen.getByText("No open orders")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows partial fill progress against the order size", () => {
    render(<OpenOrders orders={[order({ id: "a", filled: 40, size: 100 })]} />);

    expect(screen.getByRole("row", { name: /40 \/ 100/ })).toBeInTheDocument();
  });

  // The market column only earns its space on the profile screen, where orders
  // from several campaigns are listed together.
  it("hides the market column unless orders span campaigns", () => {
    const { rerender } = render(<OpenOrders orders={[order({ id: "a" })]} />);
    expect(screen.queryByRole("columnheader", { name: "Market" })).not.toBeInTheDocument();

    rerender(<OpenOrders orders={[order({ id: "a" })]} showMarket />);
    expect(screen.getByRole("columnheader", { name: "Market" })).toBeInTheDocument();
    expect(screen.getByText("Aurora Compute")).toBeInTheDocument();
  });

  it("renders a dash rather than an invalid date for an unknown placement time", () => {
    render(<OpenOrders orders={[order({ id: "a", placedAt: "" })]} />);

    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });
});

describe("OpenOrders cancelling", () => {
  // Read-only views pass no handler, and an inert cancel button would suggest
  // an action the screen cannot perform.
  it("offers no cancel control when the parent cannot cancel", () => {
    render(<OpenOrders orders={[order({ id: "a" })]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("cancels the order whose row was used", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <OpenOrders
        orders={[
          order({ id: "a", side: "bid", cohortIndex: 1 }),
          order({ id: "b", side: "ask", cohortIndex: 2 }),
        ]}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel ask on cohort 2" }));

    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  // Only the row being cancelled shows progress; the others stay usable.
  it("shows progress on the order being cancelled alone", () => {
    render(
      <OpenOrders
        orders={[order({ id: "a", cohortIndex: 1 }), order({ id: "b", cohortIndex: 2 })]}
        onCancel={vi.fn()}
        cancellingId="a"
      />
    );

    expect(screen.getByRole("button", { name: "Cancel bid on cohort 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel bid on cohort 2" })).toBeEnabled();
  });

  it("names each cancel control by the order it acts on", () => {
    render(<OpenOrders orders={[order({ id: "a", side: "ask", cohortIndex: 3 })]} onCancel={vi.fn()} />);

    const row = screen.getByText("#3").closest("tr") as HTMLElement;
    expect(within(row).getByRole("button", { name: "Cancel ask on cohort 3" })).toBeInTheDocument();
  });
});
