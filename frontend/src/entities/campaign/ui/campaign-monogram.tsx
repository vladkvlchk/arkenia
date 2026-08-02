"use client";

import { useState } from "react";
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
 * Deterministic initials tile shown until a campaign uploads a cover — or when
 * the cover fails to load (broken/missing URL). No stock imagery, no generated
 * art — honest placeholder.
 */
export function CampaignMonogram({ name, coverUrl, size = "md", className }: CampaignMonogramProps) {
  // Track the URL that failed so a later coverUrl change re-attempts the image.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (coverUrl && failedSrc !== coverUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={coverUrl}
        alt=""
        onError={() => setFailedSrc(coverUrl)}
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
