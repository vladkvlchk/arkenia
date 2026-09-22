import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./pagination";

/**
 * The page window is a small algorithm with boundaries at both ends, which is
 * exactly where off-by-one errors live. It is deliberately tested through the
 * rendered control rather than by exporting the helper: the accessible names
 * already expose every page it offers, so there is nothing to gain from
 * reshaping the module for the benefit of its tests.
 */
function visiblePages() {
  return screen
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"))
    .filter((label): label is string => !!label?.startsWith("Page "))
    .map((label) => Number(label.replace("Page ", "")));
}

describe("Pagination window", () => {
  it("lists every page while they fit", () => {
    render(<Pagination page={1} pageCount={7} onPageChange={vi.fn()} />);

    expect(visiblePages()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the head anchored near the start", () => {
    render(<Pagination page={2} pageCount={20} onPageChange={vi.fn()} />);

    expect(visiblePages()).toEqual([1, 2, 3, 4, 20]);
  });

  it("shows first, neighbours and last in the middle", () => {
    render(<Pagination page={10} pageCount={20} onPageChange={vi.fn()} />);

    expect(visiblePages()).toEqual([1, 9, 10, 11, 20]);
  });

  it("keeps the tail anchored near the end", () => {
    render(<Pagination page={19} pageCount={20} onPageChange={vi.fn()} />);

    expect(visiblePages()).toEqual([1, 17, 18, 19, 20]);
  });

  // Eight pages is the first count that cannot be listed in full, so it is the
  // boundary the window logic switches on.
  it("switches to a windowed view one page past the full list", () => {
    render(<Pagination page={1} pageCount={8} onPageChange={vi.fn()} />);

    expect(visiblePages()).toEqual([1, 2, 3, 4, 8]);
  });

  it("marks the current page for assistive technology", () => {
    render(<Pagination page={3} pageCount={10} onPageChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 4" })).not.toHaveAttribute("aria-current");
  });

  it("renders nothing when there is a single page", () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("Pagination navigation", () => {
  it("moves to the page that was clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageCount={10} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("steps with the previous and next controls", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={5} pageCount={10} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenLastCalledWith(6);

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenLastCalledWith(4);
  });

  // The page number lives in the URL, so a redundant change would push a
  // duplicate history entry and make the back button appear broken.
  it("ignores a click on the page already shown", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={3} pageCount={10} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("disables stepping past either end", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination page={1} pageCount={10} onPageChange={onPageChange} />
    );

    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();

    rerender(<Pagination page={10} pageCount={10} onPageChange={onPageChange} />);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
