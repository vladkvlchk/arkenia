import { formatUnits } from "viem";

/**
 * Format a number with space-separated thousands and no trailing ".00".
 * Examples:
 *   fmt(1000000)      → "1 000 000"
 *   fmt(1234.5)       → "1 234.5"
 *   fmt(99.00)        → "99"
 *   fmt(0.123, 4)     → "0.1230"
 */
export function fmt(value: number, decimals?: number): string {
  const str = decimals !== undefined ? value.toFixed(decimals) : value.toString();
  const [intPart, decPart] = str.split(".");
  const spacedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  if (!decPart || /^0+$/.test(decPart)) return spacedInt;
  return `${spacedInt}.${decPart}`;
}

/**
 * Format a bigint token amount: formatUnits + fmt.
 */
export function fmtToken(value: bigint, tokenDecimals: number, displayDecimals = 2): string {
  const num = Number(formatUnits(value, tokenDecimals));
  return fmt(num, displayDecimals);
}
