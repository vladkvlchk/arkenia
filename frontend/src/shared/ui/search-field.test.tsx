import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./search-field";

/**
 * The hotkey installs a window-level listener, which is the part worth testing:
 * a global key handler that fires while the user is typing somewhere else
 * hijacks their input, and one that outlives its component keeps firing on
 * pages that no longer have a search box.
 */
function ControlledSearch({ hotkey }: { hotkey?: string }) {
  const [value, setValue] = useState("");
  return (
    <SearchField value={value} onChange={setValue} placeholder="Search campaigns" hotkey={hotkey} />
  );
}

describe("SearchField", () => {
  it("reports what was typed", async () => {
    const user = userEvent.setup();
    render(<ControlledSearch />);

    await user.type(screen.getByRole("searchbox"), "arkenia");

    expect(screen.getByRole("searchbox")).toHaveValue("arkenia");
  });

  it("clears the query from the clear button and returns focus", async () => {
    const user = userEvent.setup();
    render(<ControlledSearch />);
    const input = screen.getByRole("searchbox");

    await user.type(input, "arkenia");
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("hides the clear button while the query is empty", () => {
    render(<ControlledSearch />);

    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });
});

describe("SearchField Escape handling", () => {
  // Escape is overloaded on purpose: the first press undoes the search, the
  // second releases focus. Collapsing the two would make Escape either
  // unable to clear or unable to dismiss.
  it("clears the query on the first press and blurs on the second", async () => {
    const user = userEvent.setup();
    render(<ControlledSearch />);
    const input = screen.getByRole("searchbox");

    await user.type(input, "arkenia");

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(input).not.toHaveFocus();
  });
});

describe("SearchField hotkey", () => {
  it("focuses the field from elsewhere on the page", async () => {
    const user = userEvent.setup();
    render(<ControlledSearch hotkey="/" />);

    await user.keyboard("/");

    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  /**
   * "/" is an ordinary character inside a text field. Stealing focus mid-word
   * would silently move the rest of the user's typing into the search box —
   * the reason the handler inspects the event target before acting.
   */
  it("does not steal focus while another field has it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="Notes" />
        <ControlledSearch hotkey="/" />
      </>
    );
    const notes = screen.getByLabelText("Notes");

    await user.click(notes);
    await user.keyboard("/");

    expect(notes).toHaveFocus();
    expect(notes).toHaveValue("/");
  });

  it("ignores the key when a modifier is held", async () => {
    const user = userEvent.setup();
    render(<ControlledSearch hotkey="/" />);

    await user.keyboard("{Meta>}/{/Meta}");

    expect(screen.getByRole("searchbox")).not.toHaveFocus();
  });

  // A listener left on window after unmount would keep matching, and on a page
  // without a search field the preventDefault alone would swallow the key.
  it("removes its listener on unmount", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<ControlledSearch hotkey="/" />);

    unmount();

    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
    remove.mockRestore();
  });

  it("installs no listener when no hotkey is configured", async () => {
    const user = userEvent.setup();
    render(<ControlledSearch />);

    await user.keyboard("/");

    expect(screen.getByRole("searchbox")).not.toHaveFocus();
  });
});
