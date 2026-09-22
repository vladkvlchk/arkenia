import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Meter } from "./meter";

/**
 * The meter reports pool utilisation and cohort share, so its value is a claim
 * about money. The assertions target the accessible value rather than the CSS
 * width: assistive technology reads the former, and it is the only one of the
 * two that survives a styling change.
 */
describe("Meter", () => {
  it("reports the fraction as a percentage", () => {
    render(<Meter value={0.42} label="Pool utilisation" />);

    const meter = screen.getByRole("meter", { name: "Pool utilisation" });
    expect(meter).toHaveAttribute("aria-valuenow", "42");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
  });

  // Callers divide raised by goal, and an overfunded campaign yields more than 1.
  it("clamps a fraction above one", () => {
    render(<Meter value={1.4} label="Progress" />);

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps a negative fraction", () => {
    render(<Meter value={-0.2} label="Progress" />);

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
  });

  // raised / goal is NaN whenever the goal has not loaded yet, and 0/0 is the
  // normal state of a campaign on its first render.
  it("reports zero rather than NaN for an unresolved ratio", () => {
    render(<Meter value={0 / 0} label="Progress" />);

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
  });

  // The width is an inline style rather than a utility class, so asserting on
  // it checks the rendered bar without coupling the test to the design tokens.
  it("renders the filled portion proportionally", () => {
    render(<Meter value={0.25} label="Progress" />);

    expect(screen.getByRole("meter").firstElementChild).toHaveStyle({ width: "25%" });
  });
});
