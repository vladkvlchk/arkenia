import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddressChip } from "./address-chip";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

/**
 * jsdom ships no clipboard implementation, so the component's copy path would
 * silently short-circuit and the confirmation state would never be exercised.
 * user-event installs a stub on setup(); these tests use it rather than
 * reaching for the real API.
 */
describe("AddressChip", () => {
  it("shows the address truncated and the full value on hover", () => {
    render(<AddressChip address={ADDRESS} />);

    expect(screen.getByText("0x1234…5678")).toHaveAttribute("title", ADDRESS);
  });

  it("prefers a human label when one is supplied", () => {
    render(<AddressChip address={ADDRESS} label="arkenia.eth" />);

    expect(screen.getByText("arkenia.eth")).toBeInTheDocument();
    expect(screen.queryByText("0x1234…5678")).not.toBeInTheDocument();
  });

  // Reached whenever a contract read has not resolved. Rendering a dash beats
  // rendering an empty chip that looks like a missing account.
  it("renders a placeholder instead of an empty chip", () => {
    render(<AddressChip address="" />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("links out to the block explorer in a new tab", () => {
    render(<AddressChip address={ADDRESS} />);

    const link = screen.getByRole("link", { name: "View on block explorer" });
    expect(link).toHaveAttribute("href", expect.stringContaining(ADDRESS));
    // noreferrer is not decoration: without it the explorer receives the
    // referring page through window.opener.
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("omits the explorer link when the row already links out", () => {
    render(<AddressChip address={ADDRESS} explorer={false} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("copies the full address, not the truncated label", async () => {
    const user = userEvent.setup();
    render(<AddressChip address={ADDRESS} />);

    await user.click(screen.getByRole("button", { name: `Copy address ${ADDRESS}` }));

    await expect(navigator.clipboard.readText()).resolves.toBe(ADDRESS);
  });
});

describe("AddressChip copy confirmation", () => {
  // The confirmation is a timed state, so real time would mean a real 1.4s wait
  // in the suite. shouldAdvanceTime keeps the faked clock ticking on its own,
  // which user-event needs for its internal pacing — a plain useFakeTimers()
  // leaves those timers pending and every click hangs until the test times out.
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("acknowledges the copy and reverts on its own", async () => {
    const user = userEvent.setup();
    render(<AddressChip address={ADDRESS} />);

    await user.click(screen.getByRole("button", { name: `Copy address ${ADDRESS}` }));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1400);
    expect(screen.getByRole("button", { name: `Copy address ${ADDRESS}` })).toBeInTheDocument();
  });
});
