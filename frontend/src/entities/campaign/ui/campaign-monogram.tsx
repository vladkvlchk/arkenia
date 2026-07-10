import { cn } from "@/shared/lib/cn";

interface CampaignMonogramProps {
  name: string;
  coverUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-8 w-8 text-2xs",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-sm",
} as const;

/**
 * Deterministic initials tile shown until a campaign uploads a cover.
 * No stock imagery, no generated art — honest placeholder.
 * TODO(onchain): render coverUrl from campaign metadata when present.
 */
export function CampaignMonogram({ name, coverUrl, size = "md", className }: CampaignMonogramProps) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={coverUrl}
        alt=""
        className={cn("shrink-0 rounded-md border border-line object-cover", sizes[size], className)}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 font-mono font-medium text-ink-subtle",
        sizes[size],
        className
      )}
    >
      {initials}
    </div>
  );
}
