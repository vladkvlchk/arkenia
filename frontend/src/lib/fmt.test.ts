import { describe, expect, it } from "vitest";
import { fmt, fmtToken } from "./fmt";

// The separator this module emits. Written as an escape: a literal U+00A0 is
// indistinguishable from a plain space here and in the failure diff.
const NBSP = "\u00A0";

/**
 * fmtToken is the boundary where a contract's base units become something a
 * person reads. Both directions of that conversion have failure modes worth
 * pinning: too few display decimals hides a balance, and Number() on a large
 * bigint loses precision before formatting ever runs.
 */
describe("fmt", () => {
  it("groups thousands and drops a zero fraction", () => {
    expect(fmt(1_000_000)).toBe(`1${NBSP}000${NBSP}000`);
    expect(fmt(1234.5)).toBe(`1${NBSP}234.5`);
    expect(fmt(99.0)).toBe("99");
  });

  it("pads to the requested precision", () => {
    expect(fmt(0.123, 4)).toBe("0.1230");
    expect(fmt(5, 2)).toBe("5");
  });
});

describe("fmtToken", () => {
  // The default display precision is two decimals, and a fraction is only
  // dropped when it is entirely zeros — so 1250.5 keeps its trailing zero.
  it("converts six-decimal base units to a readable amount", () => {
    expect(fmtToken(1_250_000_000n, 6)).toBe(`1${NBSP}250`);
    expect(fmtToken(1_250_500_000n, 6)).toBe(`1${NBSP}250.50`);
  });

  it("renders an empty balance as zero", () => {
    expect(fmtToken(0n, 6)).toBe("0");
  });

  // Dust below the display precision must not read as a non-zero balance the
  // user cannot act on, nor as an empty one when it is genuinely there.
  it("rounds sub-cent dust to the display precision", () => {
    expect(fmtToken(1n, 6)).toBe("0");
    expect(fmtToken(5_000n, 6)).toBe("0.01");
  });

  it("honours a wider display precision", () => {
    expect(fmtToken(1_234_567n, 6, 6)).toBe("1.234567");
  });

  it("handles eighteen-decimal tokens", () => {
    expect(fmtToken(10n ** 18n, 18)).toBe("1");
  });

  /**
   * formatUnits returns a string precisely; Number() then drops to float64.
   * Above 2^53 base units the displayed figure stops matching the chain — the
   * ceiling is pinned here so the limitation is a known one rather than a
   * surprise on a large campaign.
   */
  it("stays exact up to the float64 boundary", () => {
    expect(fmtToken(9_007_199_254n, 6)).toBe(`9${NBSP}007.20`);
  });
});
