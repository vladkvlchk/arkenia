import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CampaignBanner } from "./campaign-banner";

/**
 * Covers are uploaded by campaign owners and served from object storage, so the
 * URL outlives the file behind it. The placeholder is not a nicety — it is what
 * stands between a dead link and a broken-image glyph at the top of the card.
 */
describe("CampaignBanner", () => {
  it("shows the cover when one loads", () => {
    render(<CampaignBanner name="Aurora Compute" coverUrl="/covers/aurora.svg" />);

    expect(screen.getByRole("presentation")).toHaveAttribute("src", "/covers/aurora.svg");
  });

  it("falls back to the ghost initial with no cover", () => {
    render(<CampaignBanner name="Aurora Compute" />);

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("falls back to the ghost initial after the cover fails", () => {
    render(<CampaignBanner name="Aurora Compute" coverUrl="/covers/missing.svg" />);

    fireEvent.error(screen.getByRole("presentation"));

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  /**
   * The failed URL is remembered rather than a boolean flag, so replacing a
   * broken cover shows the new one without a remount. A flag would leave the
   * placeholder in place until the page reloaded.
   */
  it("retries once the cover URL changes", () => {
    const { rerender } = render(
      <CampaignBanner name="Aurora Compute" coverUrl="/covers/missing.svg" />
    );
    fireEvent.error(screen.getByRole("presentation"));

    rerender(<CampaignBanner name="Aurora Compute" coverUrl="/covers/new.svg" />);

    expect(screen.getByRole("presentation")).toHaveAttribute("src", "/covers/new.svg");
  });

  it("uppercases the initial and ignores leading whitespace", () => {
    render(<CampaignBanner name="  aurora compute" />);

    expect(screen.getByText("A")).toBeInTheDocument();
  });

  // A campaign whose metadata has not resolved arrives without a name; an empty
  // frontispiece would look like a rendering failure.
  it("marks the placeholder rather than leaving it blank for a nameless campaign", () => {
    render(<CampaignBanner name="" />);

    expect(screen.getByText("·")).toBeInTheDocument();
  });

  // The banner is decoration beside a heading that already names the campaign;
  // announcing a bare letter would only add noise.
  it("keeps the placeholder out of the accessibility tree", () => {
    const { container } = render(<CampaignBanner name="Aurora Compute" />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
