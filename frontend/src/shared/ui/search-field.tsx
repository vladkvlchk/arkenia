"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Global key that focuses the field (skipped while typing elsewhere). Shown as a kbd hint. */
  hotkey?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Index search line. Escape clears the query (then blurs); the optional hotkey
 * focuses it from anywhere on the page.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  hotkey,
  className,
  "aria-label": ariaLabel,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== hotkey || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)
        return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey]);

  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2.5 rounded-md border border-line-strong bg-surface px-3.5",
        "transition-colors duration-150 focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/15",
        className
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        role="searchbox"
        aria-label={ariaLabel ?? placeholder ?? "Search"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          if (value) onChange("");
          else e.currentTarget.blur();
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-full w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="shrink-0 rounded text-ink-subtle transition-colors duration-150 hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : hotkey && !focused ? (
        <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-2xs leading-none text-ink-subtle sm:block">
          {hotkey}
        </kbd>
      ) : null}
    </div>
  );
}
