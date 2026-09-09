import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TOKEN_SYMBOL } from "@/shared/config";
import { TokenAmount } from "./token-amount";

/**
 * Every on-chain quantity in the app renders through this component, so the
 * sign it prints is load-bearing: a refund shown as an inflow, or a fee shown
 * as a credit, is a correctness bug the user cannot detect.
 */

// The sign is U+2212 and the formatters group with U+00A0 — both invisible in a
// failure diff, so they are named. The symbol is read from config rather than
// written as a literal: it is "USDC" or "tUSDC" depending on the chain the env
// points at, and hardcoding either would fail the suite on the other contour.
const MINUS = "−";

function renderAmount(ui: React.ReactElement) {
  const { container } = render(ui);
  return container.textContent?.replace(/\s/g, " ") ?? "";
}

describe("TokenAmount", () => {
  it("renders money style with two decimals by default", () => {
    expect(renderAmount(<TokenAmount value={1250} />)).toBe(`1 250.00${TOKEN_SYMBOL}`);
  });

  it("trims a zero fraction in auto precision", () => {
    expect(renderAmount(<TokenAmount value={1250} precision="auto" />)).toBe(
      `1 250${TOKEN_SYMBOL}`
    );
  });

  it("honours an explicit precision", () => {
    expect(renderAmount(<TokenAmount value={0.123456} precision={4} />)).toBe(
      `0.1235${TOKEN_SYMBOL}`
    );
  });

  // A negative amount must read as negative whether or not the caller opted
  // into signed rendering — only the leading "+" is opt-in.
  it("marks a negative amount without the signed flag", () => {
    expect(renderAmount(<TokenAmount value={-40} />)).toBe(`${MINUS}40.00${TOKEN_SYMBOL}`);
  });

  it("adds a leading plus only when signed", () => {
    expect(renderAmount(<TokenAmount value={40} signed />)).toBe(`+40.00${TOKEN_SYMBOL}`);
  });

  it("formats the magnitude, not the signed value", () => {
    expect(renderAmount(<TokenAmount value={-1250.5} signed />)).toBe(
      `${MINUS}1 250.50${TOKEN_SYMBOL}`
    );
  });

  it("accepts a symbol override", () => {
    expect(renderAmount(<TokenAmount value={1} symbol="shares" />)).toBe("1.00shares");
  });
});
