import { describe, expect, it } from "vitest";
import {
  fmtAmount,
  fmtDate,
  fmtDateTime,
  fmtNum,
  fmtPct,
  sumTokens,
  truncateAddress,
} from "./format";

// The formatters emit U+00A0 rather than a plain space. Written as an escape
// rather than the character itself: the two are indistinguishable on screen and
// in a failure diff, so a literal invites an expectation that looks correct but
// compares against the wrong character.
const NBSP = "\u00A0";

describe("fmtNum", () => {
  it("groups thousands and drops a zero fraction", () => {
    expect(fmtNum(1_234_567.8)).toBe(`1${NBSP}234${NBSP}567.8`);
    expect(fmtNum(999)).toBe("999");
    expect(fmtNum(1000)).toBe(`1${NBSP}000`);
    expect(fmtNum(99.0)).toBe("99");
  });

  it("keeps the requested precision when asked", () => {
    expect(fmtNum(0.123, 4)).toBe("0.1230");
  });

  it("places separators correctly across group boundaries", () => {
    expect(fmtNum(99_999)).toBe(`99${NBSP}999`);
    expect(fmtNum(100_000)).toBe(`100${NBSP}000`);
    expect(fmtNum(1_000_000)).toBe(`1${NBSP}000${NBSP}000`);
  });

  it("does not group the minus sign with the leading digits", () => {
    expect(fmtNum(-1234)).toBe(`-1${NBSP}234`);
  });

  it("falls back to zero on non-finite input", () => {
    expect(fmtNum(NaN)).toBe("0");
    expect(fmtNum(NaN, 2)).toBe("0.00");
  });
});

describe("fmtAmount", () => {
  it("always renders two decimals", () => {
    expect(fmtAmount(1250)).toBe(`1${NBSP}250.00`);
    expect(fmtAmount(0)).toBe("0.00");
    expect(fmtAmount(0.5)).toBe("0.50");
  });

  // Rounding is delegated to toFixed, so it inherits float64 representation:
  // 0.125 is exact and rounds half-up, while 1.005 is really 1.00499… and
  // rounds down. Pinned here because the behaviour is surprising, not because
  // it is desirable.
  it("rounds through toFixed, including its float64 edges", () => {
    expect(fmtAmount(0.125)).toBe("0.13");
    expect(fmtAmount(1.005)).toBe("1.00");
    expect(fmtAmount(1.004)).toBe("1.00");
  });

  // Reached whenever a balance read resolves to undefined mid-reconnect: the
  // raw implementation rendered the string "NaN.undefined" into the label row.
  it("renders zero rather than a broken string on non-finite input", () => {
    expect(fmtAmount(NaN)).toBe("0.00");
    expect(fmtAmount(Infinity)).toBe("0.00");
  });
});

describe("sumTokens", () => {
  /**
   * The case that put "1 319.9999990000001 tUSDC" in the profile's headline
   * claimable balance: four positions worth 0, 1000, 0 and 319.999999, whose
   * plain float sum carries an error at the thirteenth decimal — and fmtNum
   * with no `decimals` renders a float verbatim.
   */
  it("adds claimable balances without float drift", () => {
    const positions = [0, 1000, 0, 319.999999];

    expect(positions.reduce((s, v) => s + v, 0)).toBe(1319.9999990000001); // the bug
    expect(sumTokens(positions)).toBe(1319.999999);
  });

  // Dust is real, not noise: floored RAY arithmetic genuinely produces amounts
  // at the sixth decimal, and they must survive summation intact.
  it("keeps amounts at the token's six decimals", () => {
    expect(sumTokens([0.000001, 0.000002])).toBe(0.000003);
    expect(sumTokens([1209.999999, 0.000001])).toBe(1210);
  });

  it("returns zero for nothing to add", () => {
    expect(sumTokens([])).toBe(0);
  });

  // A position read mid-reconnect resolves to undefined and arrives as NaN.
  // The old reduce propagated it too, and both fmtNum and fmtAmount render
  // non-finite input as zero — so this pins behaviour rather than changing it.
  it("propagates a non-finite amount for the formatters to handle", () => {
    expect(fmtAmount(sumTokens([100, NaN]))).toBe("0.00");
  });
});

describe("fmtPct", () => {
  it("converts a fraction to a percentage", () => {
    expect(fmtPct(0.0521)).toBe("5.21%");
    expect(fmtPct(1)).toBe("100.00%");
    expect(fmtPct(0.5, 0)).toBe("50%");
  });
});

describe("truncateAddress", () => {
  const address = "0x1234567890abcdef1234567890abcdef12345678";

  it("keeps the prefix and the last four characters", () => {
    expect(truncateAddress(address)).toBe("0x1234…5678");
    expect(truncateAddress(address, 6)).toBe("0x123456…345678");
  });

  // Callers pass the connected address straight through, and it is null or
  // undefined whenever no wallet is connected.
  it("returns an empty string when there is no address", () => {
    expect(truncateAddress(undefined)).toBe("");
    expect(truncateAddress(null)).toBe("");
  });

  it("leaves a string shorter than the truncation untouched", () => {
    expect(truncateAddress("0x1234")).toBe("0x1234");
  });
});

describe("fmtDate", () => {
  // TZ is pinned to UTC in vitest.config.mts; without it these assertions would
  // pass locally and fail in CI, since 23:30 UTC is already the next day east
  // of the meridian.
  it("formats an ISO date in day-month-year order", () => {
    expect(fmtDate("2026-03-12T10:00:00.000Z")).toBe("12 Mar 2026");
  });

  it("does not shift the day near the UTC boundary", () => {
    expect(fmtDate("2026-03-12T23:30:00.000Z")).toBe("12 Mar 2026");
  });

  /**
   * A cohort's formation time is only in the Withdrawn event, so useCohortsView
   * fills it from the indexer and passes an empty string whenever the indexer
   * has not covered that campaign — or is unreachable. Rendering the literal
   * "Invalid Date" in a financial table is worse than an honest dash.
   */
  it("renders a placeholder for a missing or unparseable date", () => {
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
  });
});

describe("fmtDateTime", () => {
  it("renders day, month and time", () => {
    expect(fmtDateTime("2026-03-12T14:03:00.000Z")).toBe("12 Mar, 14:03");
  });

  it("renders a placeholder for a missing date", () => {
    expect(fmtDateTime("")).toBe("—");
  });
});
