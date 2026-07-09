"use client";

import { useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { truncateAddress } from "@/shared/lib/format";
import { explorerAddressUrl } from "@/shared/config";

interface AddressChipProps {
  address: string;
  /** Optional human label (e.g. a basename); the address stays visible on hover via title. */
  label?: string;
  /** "chip" = bordered pill; "plain" = inline text for tables and dense rows. */
  variant?: "chip" | "plain";
  /** Hide the explorer link (e.g. when the row itself links out). */
  explorer?: boolean;
  className?: string;
}

/**
 * The canonical way to show an account: truncated mono, one-click copy,
 * explorer link. Trust cue — never render a bare unverifiable address string.
 */
export function AddressChip({
  address,
  label,
  variant = "chip",
  explorer = true,
  className,
}: AddressChipProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Tolerate a missing address (e.g. a read that hasn't resolved) rather than crashing.
  if (!address) return <span className="text-ink-faint">—</span>;

  function copy() {
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 font-mono text-xs text-ink-muted",
        variant === "chip" && "h-7 rounded-full border border-line bg-surface pl-2.5 pr-1",
        className
      )}
    >
      <span title={address} className="truncate">
        {label ?? truncateAddress(address)}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy address ${address}`}
        className="rounded-sm p-1 text-ink-faint transition-colors duration-150 hover:text-ink"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" aria-hidden />
        ) : (
          <Copy className="h-3 w-3" aria-hidden />
        )}
      </button>
      {explorer && (
        <a
          href={explorerAddressUrl(address)}
          target="_blank"
          rel="noreferrer"
          aria-label="View on block explorer"
          className="rounded-sm p-1 text-ink-faint transition-colors duration-150 hover:text-ink"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
    </span>
  );
}
