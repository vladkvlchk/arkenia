import { describe, expect, it } from "vitest";
import { normalizeAmountInput, toAmountString } from "./amount";

describe("normalizeAmountInput", () => {
  it("passes through a plain decimal", () => {
    expect(normalizeAmountInput("1250.75")).toBe("1250.75");
    expect(normalizeAmountInput("0")).toBe("0");
    expect(normalizeAmountInput("")).toBe("");
  });

  it("drops characters that are not digits or separators", () => {
    expect(normalizeAmountInput("12abc.5$")).toBe("12.5");
    expect(normalizeAmountInput("-40")).toBe("40");
    expect(normalizeAmountInput(" 1 000 ")).toBe("1000");
  });

  it("accepts a comma as the decimal separator", () => {
    expect(normalizeAmountInput("1,5")).toBe("1.5");
  });

  // A single non-global replace would convert only the first comma and let the
  // filter strip the second, turning 1 234,56 into 1.23456 — a silent
  // thousandfold error, most easily reached by pasting rather than typing.
  it("does not change the magnitude when several commas are present", () => {
    expect(normalizeAmountInput("1,234,56")).toBe("1.234");
  });

  // European thousands separators. Merging the groups would yield "1.234567";
  // discarding the tail is wrong too, but visibly so, and the user can correct it.
  it("discards input past a second separator instead of merging groups", () => {
    expect(normalizeAmountInput("1.234.567")).toBe("1.234");
  });

  it("keeps a trailing separator so typing can continue", () => {
    expect(normalizeAmountInput("12.")).toBe("12.");
    expect(normalizeAmountInput(".")).toBe(".");
  });

  // parseUnits(value, 6) rounds: "1.9999999" becomes 2000000n, i.e. 2.0.
  // Truncating at the input boundary keeps the signed amount at or below what
  // the user actually entered.
  it("truncates the fraction to the token precision", () => {
    expect(normalizeAmountInput("1.99999999")).toBe("1.999999");
    expect(normalizeAmountInput("0.123456789")).toBe("0.123456");
  });

  it("honours a custom precision", () => {
    expect(normalizeAmountInput("1.23456789", 2)).toBe("1.23");
    expect(normalizeAmountInput("1.5", 0)).toBe("1.");
  });
});

describe("toAmountString", () => {
  it("renders an ordinary balance", () => {
    expect(toAmountString(1250.5)).toBe("1250.5");
    expect(toAmountString(42)).toBe("42");
  });

  // Trailing zeros are only padding inside a fraction. Trimming them from a
  // whole number would divide the balance by a power of ten.
  it("keeps the zeros of a whole-number balance", () => {
    expect(toAmountString(1250)).toBe("1250");
    expect(toAmountString(1_000_000)).toBe("1000000");
    expect(toAmountString(10.5)).toBe("10.5");
  });

  // Truncation, not rounding: a MAX action must never exceed the balance it
  // was derived from.
  it("truncates a balance carrying float artefacts", () => {
    expect(toAmountString(1.9999999)).toBe("1.999999");
    expect(toAmountString(0.1 + 0.2)).toBe("0.3");
  });

  // String(1e21) === "1e+21", which parseUnits rejects.
  it("never produces exponential notation", () => {
    expect(toAmountString(1e21)).toBe("1000000000000000000000");
    expect(toAmountString(1e-7)).toBe("0");
  });

  it("collapses non-finite and non-positive input to zero", () => {
    expect(toAmountString(NaN)).toBe("0");
    expect(toAmountString(Infinity)).toBe("0");
    expect(toAmountString(-5)).toBe("0");
    expect(toAmountString(0)).toBe("0");
  });
});
