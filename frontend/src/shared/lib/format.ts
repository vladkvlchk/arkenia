/**
 * Pure display formatters for the presentational layer.
 * Mirrors the house style from src/lib/fmt.ts (space-separated thousands,
 * no trailing ".00") without a viem dependency, so UI components stay
 * mock-friendly. On-chain bigint amounts go through lib/fmt.ts#fmtToken.
 */

/** 1234567.8 → "1 234 567.8" (non-breaking spaces). */
export function fmtNum(value: number, decimals?: number): string {
  // A wallet read mid-reconnect yields NaN; toFixed would render "NaN.undefined".
  if (!Number.isFinite(value)) return decimals !== undefined ? (0).toFixed(decimals) : "0";
  const str = decimals !== undefined ? value.toFixed(decimals) : value.toString();
  const [intPart, decPart] = str.split(".");
  const spacedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (!decPart || /^0+$/.test(decPart)) return spacedInt;
  return `${spacedInt}.${decPart}`;
}

/** Money-style: always two decimals — "1 250.00". */
export function fmtAmount(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  const str = value.toFixed(2);
  const [intPart, decPart] = str.split(".");
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${decPart}`;
}

/** 0.0521 → "5.21%" */
export function fmtPct(fraction: number, decimals = 2): string {
  return `${(fraction * 100).toFixed(decimals)}%`;
}

/** 0x1234…abcd */
export function truncateAddress(address?: string | null, chars = 4): string {
  if (!address) return "";
  if (address.length <= 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** Shown wherever a timestamp is genuinely unknown rather than merely late. */
const NO_DATE = "—";

/**
 * Cohorts built from chain reads alone carry no formation timestamp — the
 * indexer supplies it — so an empty string reaches these formatters as a normal
 * case. Date rendering of an unparseable value produces the literal string
 * "Invalid Date", which is worse than admitting the value is missing.
 */
function parseIso(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ISO date → "12 Mar 2026" */
export function fmtDate(iso: string): string {
  const date = parseIso(iso);
  if (!date) return NO_DATE;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** ISO date → "12 Mar, 14:03" */
export function fmtDateTime(iso: string): string {
  const date = parseIso(iso);
  if (!date) return NO_DATE;
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
