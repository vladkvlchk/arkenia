import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Campaign } from "@/entities/campaign";
import { CampaignList } from "./campaign-list";
import { ViewSwitch } from "./view-switch";

/**
 * The two views render the same page of campaigns, so the thing worth guarding is that they
 * agree: the same array in, the same campaigns visible. The card view promotes the first entry
 * into a wide split card, and that promotion is the one place a campaign could silently vanish
 * when the table reuses the same array.
 */
function campaign(overrides: Partial<Campaign> & { address: `0x${string}` }): Campaign {
  return {
    name: "Aurora Compute",
    description: "Distributed GPU cycles.",
    angel: { address: "0x9999999999999999999999999999999999999999" },
    status: "returning",
    poolBalance: 300,
    totalDeposited: 1200,
    totalWithdrawn: 900,
    totalReturned: 210,
    cohortCount: 1,
    believers: 4,
    createdAt: "2026-07-10T18:11:06.000Z",
    ...overrides,
  };
}

const A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const C = "0xcccccccccccccccccccccccccccccccccccccccc" as const;

const THREE = [
  campaign({ address: A, name: "Aurora Compute" }),
  campaign({ address: B, name: "Meridian Yield" }),
  campaign({ address: C, name: "Tessellate Labs" }),
];

function list(props: Partial<React.ComponentProps<typeof CampaignList>> = {}) {
  return render(
    <CampaignList
      campaigns={THREE}
      view="table"
      sort="new"
      onSortChange={vi.fn()}
      {...props}
    />
  );
}

describe("CampaignList parity between views", () => {
  /**
   * `featureFirst` promotes campaigns[0] into a split card. Passing the same flag through to the
   * table and slicing on it would drop the first campaign off the page entirely — the row is not
   * rendered anywhere else to make up for it.
   */
  it("shows every campaign in the table even when the card view would feature one", () => {
    list({ view: "table", featureFirst: true });

    expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3
    for (const name of ["Aurora Compute", "Meridian Yield", "Tessellate Labs"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("shows every campaign in the card view when one is featured", () => {
    list({ view: "cards", featureFirst: true });

    for (const name of ["Aurora Compute", "Meridian Yield", "Tessellate Labs"]) {
      expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    }
  });

  it("renders no table markup in the card view", () => {
    list({ view: "cards" });

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("CampaignList table columns", () => {
  // The realised multiple is a verdict on a finished campaign; showing it mid-flight would read
  // as one. Mirrors the same rule in CampaignCard's StatRow.
  it("shows a realised multiple only once a campaign has closed", () => {
    render(
      <CampaignList
        campaigns={[
          campaign({ address: A, name: "Open one", status: "returning" }),
          campaign({
            address: B,
            name: "Closed one",
            status: "closed",
            totalWithdrawn: 900,
            totalReturned: 1210,
          }),
        ]}
        view="table"
        sort="new"
        onSortChange={vi.fn()}
      />
    );

    const closed = screen.getByRole("link", { name: "Closed one" }).closest("tr") as HTMLElement;
    const open = screen.getByRole("link", { name: "Open one" }).closest("tr") as HTMLElement;

    expect(within(closed).getByText("1.34×")).toBeInTheDocument();
    expect(within(open).queryByText(/×$/)).not.toBeInTheDocument();
  });

  it("gives every row an unambiguous link to its campaign", () => {
    list({ view: "table" });

    expect(screen.getByRole("link", { name: "Aurora Compute" })).toHaveAttribute(
      "href",
      `/campaign/${A}`
    );
  });
});

describe("CampaignList sorting", () => {
  /**
   * A header that looks clickable and does nothing is worse than a plain one. Only the four
   * columns the index can actually sort by are buttons.
   */
  it("offers buttons for exactly the sortable columns", () => {
    list({ view: "table" });

    const headers = screen.getAllByRole("columnheader");
    const withButton = headers
      .filter((h) => within(h).queryByRole("button"))
      .map((h) => h.textContent?.trim());

    expect(withButton).toEqual(["Raised", "Returned", "Believers", "Created"]);
  });

  it("drives the index's own sort state rather than a parallel one", async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    list({ view: "table", onSortChange });

    await user.click(screen.getByRole("button", { name: "Raised" }));

    expect(onSortChange).toHaveBeenCalledWith("raised");
  });

  // Screen readers announce the sorted column through aria-sort; without it the arrow is the
  // only signal, and it is decorative.
  it("marks the active column as sorted, and only that column", () => {
    list({ view: "table", sort: "returned" });

    const sorted = screen.getAllByRole("columnheader").filter((h) => h.getAttribute("aria-sort"));

    expect(sorted).toHaveLength(1);
    expect(sorted[0]).toHaveTextContent("Returned");
    expect(sorted[0]).toHaveAttribute("aria-sort", "descending");
  });
});

describe("ViewSwitch", () => {
  it("names the control and marks the current view", () => {
    render(<ViewSwitch value="table" onChange={vi.fn()} />);

    expect(screen.getByRole("tablist", { name: "List view" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Table" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Cards" })).toHaveAttribute("aria-selected", "false");
  });

  /**
   * The buttons are icon-only. The label is still in the DOM as sr-only, and it is the whole
   * accessible name — drop it and the control is announced as nothing at all.
   */
  it("keeps an accessible name once the label is visually hidden", () => {
    render(<ViewSwitch value="cards" onChange={vi.fn()} />);

    for (const label of ["Cards", "Table"]) {
      const tab = screen.getByRole("tab", { name: label });
      expect(tab).toHaveAttribute("title", label);
      expect(within(tab).getByText(label)).toHaveClass("sr-only");
    }
  });

  it("reports the view the user picked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ViewSwitch value="cards" onChange={onChange} />);

    await user.click(screen.getByRole("tab", { name: "Table" }));

    expect(onChange).toHaveBeenCalledWith("table");
  });
});
