import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CampaignMonogram } from "./campaign-monogram";

/**
 * The cover is user-supplied and its URL outlives the file it points at, so the
 * broken-image path is the normal path often enough to be worth pinning: a
 * campaign whose cover 404s must still render an identifiable tile rather than
 * a browser's broken-image glyph.
 */
describe("CampaignMonogram", () => {
  it("shows the cover when one is available", () => {
    render(<CampaignMonogram name="Aurora Compute" coverUrl="/covers/aurora.svg" />);

    expect(screen.getByRole("presentation")).toHaveAttribute("src", "/covers/aurora.svg");
  });

  it("falls back to initials when there is no cover", () => {
    render(<CampaignMonogram name="Aurora Compute" />);

    expect(screen.getByText("AC")).toBeInTheDocument();
  });

  it("falls back to initials after the cover fails to load", () => {
    render(<CampaignMonogram name="Aurora Compute" coverUrl="/covers/missing.svg" />);

    fireEvent.error(screen.getByRole("presentation"));

    expect(screen.getByText("AC")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  /**
   * The failed URL is remembered rather than a boolean flag, so a campaign that
   * uploads a replacement cover shows it immediately. A boolean would keep the
   * placeholder until a remount.
   */
  it("retries once the cover URL changes", () => {
    const { rerender } = render(
      <CampaignMonogram name="Aurora Compute" coverUrl="/covers/missing.svg" />
    );
    fireEvent.error(screen.getByRole("presentation"));
    expect(screen.getByText("AC")).toBeInTheDocument();

    rerender(<CampaignMonogram name="Aurora Compute" coverUrl="/covers/replacement.svg" />);

    expect(screen.getByRole("presentation")).toHaveAttribute("src", "/covers/replacement.svg");
  });
});

describe("CampaignMonogram initials", () => {
  it("takes the first letter of the first two words", () => {
    render(<CampaignMonogram name="Aurora Compute Labs" />);

    expect(screen.getByText("AC")).toBeInTheDocument();
  });

  it("uppercases a lowercase name", () => {
    render(<CampaignMonogram name="aurora compute" />);

    expect(screen.getByText("AC")).toBeInTheDocument();
  });

  it("uses a single letter for a one-word name", () => {
    render(<CampaignMonogram name="Aurora" />);

    expect(screen.getByText("A")).toBeInTheDocument();
  });

  // A campaign whose metadata has not resolved arrives with an empty name, and
  // "".split() yields [""] — indexing into it must not throw.
  it("renders an empty tile rather than crashing on a missing name", () => {
    expect(() => render(<CampaignMonogram name="" />)).not.toThrow();
  });

  it("tolerates surrounding whitespace in a name", () => {
    render(<CampaignMonogram name="  Aurora Compute  " />);

    expect(screen.getByText("AC")).toBeInTheDocument();
  });
});
