import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Campaign } from "../types";
import { CampaignCard } from "./campaign-card";

/**
 * Two layouts of the same record. The layout itself is not worth asserting on,
 * but one editorial rule is: the realised multiple is a verdict on the
 * campaign, and showing it while capital is still deployed states an outcome
 * that has not happened yet.
 */
const ADDRESS = "0xce9ce282137528c916a15ad5542403bff51845ca" as const;

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    address: ADDRESS,
    name: "Aurora Compute",
    description: "Distributed GPU cycles for open model training.",
    angel: { address: "0x9999999999999999999999999999999999999999" },
    status: "open",
    poolBalance: 400,
    totalDeposited: 1000,
    totalWithdrawn: 600,
    totalReturned: 120,
    cohortCount: 2,
    believers: 42,
    createdAt: "2026-03-12T10:00:00.000Z",
    ...overrides,
  };
}

describe.each(["banner", "split"] as const)("CampaignCard (%s)", (variant) => {
  it("links to the campaign it describes", () => {
    render(<CampaignCard campaign={campaign()} variant={variant} />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("href", `/campaign/${ADDRESS}`);
    }
  });

  it("names the campaign and its status", () => {
    render(<CampaignCard campaign={campaign({ status: "returning" })} variant={variant} />);

    expect(screen.getByRole("link", { name: "Aurora Compute" })).toBeInTheDocument();
    expect(screen.getByText("Returning")).toBeInTheDocument();
  });

  it("credits the angel behind the campaign", () => {
    render(<CampaignCard campaign={campaign()} variant={variant} />);

    expect(screen.getByText("0x9999…9999")).toBeInTheDocument();
  });
});

describe("CampaignCard realised multiple", () => {
  /**
   * A campaign still deploying capital has no realised multiple — the returns
   * so far are a running total, not a result. Rendering "0.20×" mid-flight
   * reads as a finished, disappointing outcome.
   */
  it("is withheld while the campaign is still running", () => {
    render(<CampaignCard campaign={campaign({ status: "open", totalReturned: 120 })} />);

    expect(screen.queryByText(/×$/)).not.toBeInTheDocument();
  });

  it("is withheld while returns are still arriving", () => {
    render(<CampaignCard campaign={campaign({ status: "returning" })} />);

    expect(screen.queryByText(/×$/)).not.toBeInTheDocument();
  });

  it("is shown once the campaign has closed", () => {
    render(
      <CampaignCard
        campaign={campaign({ status: "closed", totalWithdrawn: 600, totalReturned: 900 })}
      />
    );

    expect(screen.getByText("1.50×")).toBeInTheDocument();
  });

  // A campaign can close without the angel ever deploying, and the multiple
  // would be a division by zero.
  it("is withheld when nothing was ever deployed", () => {
    render(
      <CampaignCard
        campaign={campaign({ status: "closed", totalWithdrawn: 0, totalReturned: 0 })}
      />
    );

    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/×$/)).not.toBeInTheDocument();
  });
});

describe("CampaignCard non-visual context", () => {
  // The figures are rendered bare, in mono, without units beside them; the unit
  // and the cohort count reach assistive technology through this line alone.
  it("states the denomination and cohort count for assistive technology", () => {
    render(<CampaignCard campaign={campaign({ cohortCount: 3 })} />);

    expect(screen.getByText(/Amounts denominated in .*\. 3 cohorts\./)).toBeInTheDocument();
  });
});
