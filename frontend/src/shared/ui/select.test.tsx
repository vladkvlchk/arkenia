import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

/**
 * Covers the trigger, which is the part this wrapper owns. The popup is not covered, and that is
 * a real gap rather than an oversight: Radix measures the trigger and positions the content with
 * layout APIs jsdom does not implement, so the listbox never mounts here. Opening it with a
 * pointer, with the keyboard, and declaratively via `open` were all tried — the trigger renders
 * correctly as a combobox in every case and the popup appears in none of them.
 *
 * What that leaves unverified is Radix's own behaviour (roles inside the popup, typeahead, arrow
 * keys, Escape), which it tests upstream. What is verified here is the part that would silently
 * break if someone edited this file: the accessible name that replaced the removed visible label,
 * and the closed trigger showing the current value.
 *
 * The popup's appearance and keyboard handling need a real browser to confirm.
 */
const OPTIONS = [
  { value: "new", label: "Newest" },
  { value: "raised", label: "Most raised" },
  { value: "returned", label: "Most returned" },
];

function renderSelect(value = "new") {
  render(
    <Select value={value} onValueChange={vi.fn()}>
      <SelectTrigger aria-label="Sort campaigns">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

describe("Select trigger", () => {
  /**
   * The visible "Sort" label is gone, so the aria-label is the only thing left saying what this
   * control does. Without it the trigger announces just "Newest" — a value with no subject.
   */
  it("names itself even though no label is visible", () => {
    renderSelect();

    expect(screen.getByRole("combobox", { name: "Sort campaigns" })).toBeInTheDocument();
    expect(screen.queryByText("Sort")).not.toBeInTheDocument();
  });

  // A native select shows its selection for free; rendering it is now this component's job.
  it("shows the selected option while closed", () => {
    renderSelect("raised");

    expect(screen.getByRole("combobox")).toHaveTextContent("Most raised");
  });

  it("exposes itself as a combobox, not a plain button", () => {
    renderSelect();

    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-autocomplete", "none");
  });
});
