import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  /** Honest explanation of why it's empty and what fills it. No hype. */
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center px-6 py-14 text-center", className)}
      {...props}
    >
      {Icon && (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface-2/70">
          <Icon className="h-[18px] w-[18px] text-ink-subtle" aria-hidden />
        </div>
      )}
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-5 text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
