import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stat } from "./stat";

/**
 * Stat is mostly layout, and layout is not worth asserting on. The one decision
 * it makes is the delta sign, which is a claim about direction: a return shown
 * as a loss reads as a failed campaign.
 */
describe("Stat", () => {
  it("renders the label and preformatted value", () => {
    render(<Stat label="Raised" value="1 250.00" unit="tUSDC" />);

    expect(screen.getByText("Raised")).toBeInTheDocument();
    expect(screen.getByText("1 250.00")).toBeInTheDocument();
    expect(screen.getByText("tUSDC")).toBeInTheDocument();
  });

  it("prefixes a positive delta with a plus", () => {
    render(<Stat label="Returned" value="4 100" delta={4.2} />);

    expect(screen.getByText("+4.2%")).toBeInTheDocument();
  });

  // U+2212, not a hyphen: the value is already rendered in mono tabular
  // figures, and a hyphen sits at the wrong height and width beside them.
  it("prefixes a negative delta with a true minus and drops the raw sign", () => {
    render(<Stat label="Returned" value="3 900" delta={-1.3} />);

    expect(screen.getByText("−1.3%")).toBeInTheDocument();
    expect(screen.queryByText("-1.3%")).not.toBeInTheDocument();
  });

  it("accepts a delta suffix other than percent", () => {
    render(<Stat label="Believers" value="128" delta={12} deltaSuffix=" this week" />);

    expect(screen.getByText("+12 this week")).toBeInTheDocument();
  });

  it("omits the delta entirely when none is given", () => {
    render(<Stat label="Raised" value="1 250.00" />);

    expect(screen.queryByText(/[+−]/)).not.toBeInTheDocument();
  });
});
