import { cn } from "@/shared/lib/cn";

interface MeterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..1 */
  value: number;
  label?: string;
}

/** Quiet proportion bar (pool utilisation, cohort share). Never animated hype. */
export function Meter({ value, label, className, ...props }: MeterProps) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]", className)}
      {...props}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
