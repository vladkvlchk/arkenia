/**
 * Decimal-string handling for token amounts.
 *
 * Every amount the user types eventually reaches `parseUnits(value, 6)`, which
 * rounds. Rounding up an amount the user meant as a maximum produces a
 * transaction larger than their balance, so normalisation happens here — at the
 * input boundary — and always truncates. Kept free of React so it can be
 * reasoned about, and tested, as plain data transformation.
 */

/** Decimals of the fundraising token (USDC and the testnet faucet both use 6). */
export const TOKEN_DECIMALS = 6;

/**
 * Normalise free-form keyboard or clipboard input into a decimal string that is
 * safe to hand to `parseUnits`.
 *
 * Rules:
 *  - commas become dots, so EU keyboards produce a decimal separator;
 *  - anything that is not a digit or a separator is dropped;
 *  - input past a second separator is discarded rather than merged — merging
 *    turns "1.234.567" into "1.234567" and silently changes the magnitude,
 *    whereas discarding is visible in the field and the user can correct it;
 *  - the fraction is truncated to `maxDecimals`;
 *  - a trailing separator survives, so "12." is a valid intermediate state
 *    while typing.
 */
export function normalizeAmountInput(raw: string, maxDecimals = TOKEN_DECIMALS): string {
  const cleaned = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [intPart = "", fracPart] = cleaned.split(".");

  if (fracPart === undefined) return intPart;
  return `${intPart}.${fracPart.slice(0, maxDecimals)}`;
}

/**
 * Render a number as a plain decimal string for the amount field.
 *
 * `String(value)` is unusable here: it yields "1e+21" for large balances, which
 * `parseUnits` rejects, and it keeps float artefacts such as 1.9999999 that
 * `parseUnits` would round up past the balance. Truncates, never rounds.
 */
export function toAmountString(value: number, maxDecimals = TOKEN_DECIMALS): string {
  if (!Number.isFinite(value) || value <= 0) return "0";

  // toLocaleString is the only built-in that formats without an exponent across
  // the full double range; toFixed switches to exponential notation at 1e21.
  const plain = value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });

  const truncated = normalizeAmountInput(plain, maxDecimals);

  // Truncation leaves padding behind ("0.300000"); the field should read the
  // way a person would write the amount down. Guarded on the separator, since
  // stripping trailing zeros from an integer would divide it by ten.
  return truncated.includes(".")
    ? truncated.replace(/0+$/, "").replace(/\.$/, "")
    : truncated;
}
