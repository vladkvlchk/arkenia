import { cn } from "@/shared/lib/cn";

/** Loading placeholder — size it to the content it stands in for. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-ink/[0.07] dark:bg-ink/[0.09]", className)}
      {...props}
    />
  );
}
