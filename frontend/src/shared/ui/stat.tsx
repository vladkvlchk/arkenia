import { cn } from "@/shared/lib/cn";

interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** Preformatted value — always rendered in mono with tabular figures. */
  value: React.ReactNode;
  /** Small unit suffix, e.g. "tUSDC". */
  unit?: string;
  /** Signed delta, e.g. +4.2 renders green, -1.3 renders red. */
  delta?: number;
  deltaSuffix?: string;
  subtext?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const valueSize = {
  sm: "text-lg leading-6",
  md: "text-2xl leading-8",
  lg: "text-[28px] leading-9",
} as const;

/** Numeric hierarchy: overline label, big tabular mono figure, muted unit. */
export function Stat({
  label,
  value,
  unit,
  delta,
  deltaSuffix = "%",
  subtext,
  size = "md",
  className,
  ...props
}: StatProps) {
  return (
    <div className={cn("min-w-0", className)} {...props}>
      <div className="t-overline">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className={cn("font-mono font-medium tracking-tight text-ink", valueSize[size])}>
          {value}
        </span>
        {unit && <span className="font-mono text-[13px] text-ink-subtle">{unit}</span>}
        {delta !== undefined && (
          <span
            className={cn(
              "font-mono text-xs font-medium",
              delta >= 0 ? "text-success" : "text-danger"
            )}
          >
            {delta >= 0 ? "+" : "−"}
            {Math.abs(delta)}
            {deltaSuffix}
          </span>
        )}
      </div>
      {subtext && <div className="mt-1 text-xs text-ink-subtle">{subtext}</div>}
    </div>
  );
}
