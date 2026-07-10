import { cn } from "@/shared/lib/cn";

interface CampaignBannerProps {
  name: string;
  coverUrl?: string;
  className?: string;
}

/**
 * Frontispiece banner. With a cover: the image, held to greyscale so arbitrary
 * uploads stay inside the monochrome system. Without one: an honest placeholder —
 * ruled paper and a large ghost initial (no stock imagery, no generated art).
 * Expects a `group` ancestor for the hover life.
 * TODO(onchain): coverUrl comes from campaign metadata.
 */
export function CampaignBanner({ name, coverUrl, className }: CampaignBannerProps) {
  if (coverUrl) {
    return (
      <div className={cn("relative overflow-hidden bg-surface-2", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover grayscale transition-transform duration-500 ease-out group-hover:scale-[1.02]"
        />
      </div>
    );
  }

  const initial = (name.trim()[0] ?? "·").toUpperCase();

  return (
    <div aria-hidden className={cn("relative overflow-hidden bg-surface-2", className)}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, hsl(var(--line) / 0.6) 0 1px, transparent 1px 9px)",
        }}
      />
      <span className="absolute -bottom-[0.22em] left-5 select-none font-serif text-[112px] leading-none text-ink/[0.07] transition-transform duration-500 ease-out group-hover:translate-x-1.5">
        {initial}
      </span>
    </div>
  );
}
