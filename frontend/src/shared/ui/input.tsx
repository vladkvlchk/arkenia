import { forwardRef, useId } from "react";
import { cn } from "@/shared/lib/cn";

export const inputClasses = cn(
  "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink",
  "placeholder:text-ink-faint transition-colors duration-150",
  "focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/15",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15"
);

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(inputClasses, className)} {...props} />
  )
);
Input.displayName = "Input";

interface FieldProps {
  label: string;
  /** Right-aligned helper in the label row, e.g. a balance. */
  labelEnd?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error. Errors replace hints — one message at a time. */
export function Field({ label, labelEnd, hint, error, htmlFor, className, children }: FieldProps) {
  const fallbackId = useId();
  const id = htmlFor ?? fallbackId;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {labelEnd && <span className="text-xs text-ink-subtle">{labelEnd}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-subtle">{hint}</p>
      )}
    </div>
  );
}
