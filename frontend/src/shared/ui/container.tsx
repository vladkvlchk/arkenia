import { cn } from "@/shared/lib/cn";

/** Page-width container: 4px-grid gutters, 1152px max. */
export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props} />;
}
