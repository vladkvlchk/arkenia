import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

/**
 * The variant classes are not tested: they are design tokens, they change with
 * every visual revision, and asserting on them produces failures that mean
 * nothing. What is tested is the behaviour a wrong render would let through —
 * primarily that a button waiting on a transaction cannot be pressed twice.
 */
describe("Button", () => {
  it("invokes its handler on click", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Deposit</Button>);

    await user.click(screen.getByRole("button", { name: "Deposit" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  /**
   * `loading` is set while a transaction is in flight. If it did not also
   * disable the button, an impatient second click would submit a second
   * transaction — the user pays gas twice and deposits twice.
   */
  it("cannot be pressed while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Confirm deposit
      </Button>
    );

    const button = screen.getByRole("button", { name: "Confirm deposit" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  // The label stays put while loading: replacing it with a bare spinner hides
  // which action is pending when several are on screen.
  it("keeps its label visible while loading", () => {
    render(<Button loading>Confirm deposit</Button>);

    expect(screen.getByRole("button", { name: "Confirm deposit" })).toBeInTheDocument();
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Deposit
      </Button>
    );

    await user.click(screen.getByRole("button", { name: "Deposit" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  /**
   * `asChild` swaps the button element for its child through Radix Slot, which
   * accepts exactly one child. Rendering the spinner alongside would break the
   * link entirely, so the component skips it — pinned here because the guard is
   * easy to drop when the loading branch is next edited.
   */
  it("renders as its child element without wrapping it in a button", () => {
    render(
      <Button asChild>
        <a href="/campaigns">Browse campaigns</a>
      </Button>
    );

    expect(screen.getByRole("link", { name: "Browse campaigns" })).toHaveAttribute(
      "href",
      "/campaigns"
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps a caller className alongside the variant classes", () => {
    render(<Button className="w-full">Deposit</Button>);

    expect(screen.getByRole("button", { name: "Deposit" })).toHaveClass("w-full");
  });
});
