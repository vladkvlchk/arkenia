import { cn } from "@/shared/lib/cn";
import { fmtAmount, fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";

interface TokenAmountProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number;
  symbol?: string;
  /** undefined = money style (always 2dp); number = fixed decimals; "auto" = trim zeros. */
  precision?: number | "auto";
  /** Prefix +/− and color by sign — for deltas in feeds and history. */
  signed?: boolean;
  muted?: boolean;
}

/** All on-chain quantities render through this: mono, tabular, explicit unit. */
export function TokenAmount({
  value,
  symbol = TOKEN_SYMBOL,
  precision,
  signed,
  muted,
  className,
  ...props
}: TokenAmountProps) {
  const abs = Math.abs(value);
  const formatted =
    precision === "auto" ? fmtNum(abs) : precision !== undefined ? fmtNum(abs, precision) : fmtAmount(abs);
  const sign = signed ? (value < 0 ? "−" : "+") : value < 0 ? "−" : "";

  return (
    <span
      className={cn(
        "font-mono",
        signed && (value < 0 ? "text-danger" : "text-success"),
        muted && "text-ink-muted",
        className
      )}
      {...props}
    >
      {sign}
      {formatted}
      <span className={cn("ml-1 text-[0.85em]", signed ? "opacity-70" : "text-ink-subtle")}>
        {symbol}
      </span>
    </span>
  );
}
