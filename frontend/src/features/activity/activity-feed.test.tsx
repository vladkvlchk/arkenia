import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityItem } from "@/entities/campaign";
import { ActivityFeed } from "./activity-feed";

/**
 * The feed is the campaign's audit trail: every row claims that a specific
 * event happened, and the explorer link is what makes that claim checkable. A
 * row labelled as the wrong event, or pointing at the wrong transaction, is
 * worse than no row at all.
 */
const ACTOR = "0x1234567890abcdef1234567890abcdef12345678" as const;
const TX = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as const;

function item(overrides: Partial<ActivityItem> & { id: string }): ActivityItem {
  return {
    type: "deposit",
    actor: ACTOR,
    amount: 250,
    txHash: TX,
    at: "2026-03-12T14:03:00.000Z",
    ...overrides,
  };
}

describe("ActivityFeed labelling", () => {
  it("explains an empty feed", () => {
    render(<ActivityFeed items={[]} />);

    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  // Each event type reads differently, and the cohort-scoped ones have to name
  // their cohort or the row says nothing useful.
  it("labels each event type in the reader's terms", () => {
    render(
      <ActivityFeed
        items={[
          item({ id: "1", type: "deposit" }),
          item({ id: "2", type: "withdraw", cohortIndex: 3 }),
          item({ id: "3", type: "return", cohortIndex: 3 }),
          item({ id: "4", type: "claim", cohortIndex: 2 }),
          item({ id: "5", type: "refund" }),
        ]}
      />
    );

    expect(screen.getByText("Deposit to pool")).toBeInTheDocument();
    expect(screen.getByText("Cohort #3 minted")).toBeInTheDocument();
    expect(screen.getByText("Return to Cohort #3")).toBeInTheDocument();
    expect(screen.getByText("Claim from Cohort #2")).toBeInTheDocument();
    expect(screen.getByText("Pool refund")).toBeInTheDocument();
  });

  /**
   * Rows come from the indexer and are cast, not validated. A type this table
   * has not been taught yet used to destructure undefined and take the whole
   * route down — losing every other row in the process.
   */
  it("survives an event type it does not recognise", () => {
    const rows = [
      item({ id: "1", type: "deposit" }),
      item({ id: "2", type: "trade" as ActivityItem["type"] }),
      item({ id: "3", type: "refund" }),
    ];

    expect(() => render(<ActivityFeed items={rows} />)).not.toThrow();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Deposit to pool")).toBeInTheDocument();
    expect(screen.getByText("Pool refund")).toBeInTheDocument();
  });
});

describe("ActivityFeed verifiability", () => {
  it("links each row to its own transaction", () => {
    render(<ActivityFeed items={[item({ id: "1", txHash: TX })]} />);

    const link = screen.getByRole("link", { name: "View transaction on explorer" });
    expect(link).toHaveAttribute("href", expect.stringContaining(TX));
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("names the actor behind each event", () => {
    render(<ActivityFeed items={[item({ id: "1" })]} />);

    expect(screen.getByText("0x1234…5678")).toBeInTheDocument();
  });

  // A machine-readable timestamp keeps the human one from being the only copy.
  it("exposes the raw timestamp alongside the formatted one", () => {
    render(<ActivityFeed items={[item({ id: "1", at: "2026-03-12T14:03:00.000Z" })]} />);

    const row = screen.getByRole("listitem");
    const time = within(row).getByText("12 Mar, 14:03");
    expect(time).toHaveAttribute("dateTime", "2026-03-12T14:03:00.000Z");
  });

  it("renders a dash rather than an invalid date for a missing timestamp", () => {
    render(<ActivityFeed items={[item({ id: "1", at: "" })]} />);

    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });
});
