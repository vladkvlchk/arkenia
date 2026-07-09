/**
 * Pure display formatters for the presentational layer.
 * Mirrors the house style from src/lib/fmt.ts (space-separated thousands,
 * no trailing ".00") without a viem dependency, so UI components stay
 * mock-friendly. On-chain bigint amounts go through lib/fmt.ts#fmtToken.
 */

/** 1234567.8 → "1 234 567.8" (non-breaking spaces). */
export function fmtNum(value: number, decimals?: number): string {
  const str = decimals !== undefined ? value.toFixed(decimals) : value.toString();
  const [intPart, decPart] = str.split(".");
  const spacedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (!decPart || /^0+$/.test(decPart)) return spacedInt;
  return `${spacedInt}.${decPart}`;
}

/** Money-style: always two decimals — "1 250.00". */
export function fmtAmount(value: number): string {
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

/** ISO date → "12 Mar 2026" */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** ISO date → "12 Mar, 14:03" */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
