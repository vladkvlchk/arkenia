import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeSwitcher } from "./theme-switcher";
import { ThemeToggle } from "./theme-toggle";

/**
 * Theming writes to two places outside React — the root element's class list
 * and localStorage — and reads a third, the OS colour-scheme preference. Each
 * is a place the component can silently stop working: a class applied to the
 * wrong element themes nothing, and a storage write that throws in private mode
 * takes the whole click handler with it.
 */
const STORAGE_KEY = "arkenia:theme";

function setSystemPrefersDark(prefersDark: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: prefersDark,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  setSystemPrefersDark(false);
});

afterEach(() => vi.restoreAllMocks());

describe("ThemeSwitcher", () => {
  it("starts on the system option", () => {
    render(<ThemeSwitcher />);

    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores the stored choice on mount", () => {
    localStorage.setItem(STORAGE_KEY, "dark");

    render(<ThemeSwitcher />);

    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("applies and persists an explicit choice", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("removes the dark class when switching back to light", async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, "dark");
    render(<ThemeSwitcher />);

    await user.click(screen.getByRole("button", { name: "Light" }));

    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  // "System" is not a third palette — it defers to the OS, which is why it has
  // to be resolved rather than simply cleared.
  it("follows the OS preference under the system option", async () => {
    const user = userEvent.setup();
    setSystemPrefersDark(true);
    render(<ThemeSwitcher />);

    await user.click(screen.getByRole("button", { name: "System" }));

    expect(document.documentElement).toHaveClass("dark");
  });

  it("marks exactly one option as pressed", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await user.click(screen.getByRole("button", { name: "Light" }));

    const pressed = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
  });

  /**
   * Safari in private mode throws on setItem rather than failing quietly. The
   * theme not persisting is acceptable; the click handler dying before it
   * applies the theme is not.
   */
  it("still applies the theme when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement).toHaveClass("dark");
  });
});

describe("ThemeToggle", () => {
  it("flips the theme on the root element", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle color theme" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Toggle color theme" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("still toggles when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle color theme" }));

    expect(document.documentElement).toHaveClass("dark");
  });
});
