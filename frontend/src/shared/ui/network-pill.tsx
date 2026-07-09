"use client";

import { useAccount, useSwitchChain } from "wagmi";
import { cn } from "@/shared/lib/cn";
import { activeChain } from "@/lib/config";
import { CHAIN_NAME, IS_TESTNET } from "@/shared/config";

/**
 * Shows the wallet's ACTUAL network — not just the app's target. If the wallet is on the wrong
 * chain it turns into a one-click switch, so nobody can transact on the wrong network by accident.
 * (Styling is intentionally plain — to be refined later.)
 */
export function NetworkPill({ className }: { className?: string }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const wrong = isConnected && chainId !== undefined && chainId !== activeChain.id;

  if (wrong) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: activeChain.id })}
        className={cn(
          "inline-flex h-6 items-center gap-1.5 rounded-full border border-danger/40 bg-danger-soft px-2.5 font-mono text-2xs font-medium text-danger transition-colors hover:border-danger",
          className
        )}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-danger" />
        {isPending ? "Switching…" : `Wrong network → ${CHAIN_NAME}`}
      </button>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 font-mono text-2xs text-ink-muted",
        className
      )}
    >
      <span
        aria-hidden
        className={cn("h-1.5 w-1.5 rounded-full", isConnected ? "bg-success" : "bg-ink-faint")}
      />
      {CHAIN_NAME}
      {IS_TESTNET && (
        <>
          <span aria-hidden className="h-3 w-px bg-line-strong" />
          <span className="font-medium tracking-[0.08em] text-warning">TESTNET</span>
        </>
      )}
    </span>
  );
}
