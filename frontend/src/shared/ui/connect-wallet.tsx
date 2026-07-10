"use client";

import Link from "next/link";
import { LogOut, TriangleAlert } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { truncateAddress } from "@/shared/lib/format";
import { CHAIN_NAME } from "@/shared/config";
import type { WalletView } from "@/shared/lib/mock-wallet";
import { Button } from "./button";

interface ConnectWalletProps {
  wallet: WalletView;
  className?: string;
}

/**
 * Renders every wallet state explicitly: disconnected → connecting →
 * wrong-network → connected. Purely presentational — state arrives via props.
 */
export function ConnectWallet({ wallet, className }: ConnectWalletProps) {
  const { status, address, connect, disconnect, switchNetwork } = wallet;

  if (status === "disconnected") {
    return (
      <Button size="sm" onClick={connect} className={className}>
        Connect wallet
      </Button>
    );
  }

  if (status === "connecting") {
    return (
      <Button size="sm" loading className={className}>
        Connecting
      </Button>
    );
  }

  if (status === "wrong-network") {
    return (
      <button
        type="button"
        onClick={switchNetwork}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-warning/30 bg-warning-soft px-3 text-[13px] font-medium text-warning transition-colors duration-150 hover:border-warning/50",
          className
        )}
      >
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
        Switch to {CHAIN_NAME}
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Link
        href="/profile/me"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 font-mono text-xs text-ink transition-colors duration-150 hover:bg-surface-2"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
        {address ? truncateAddress(address) : "Profile"}
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={disconnect}
        aria-label="Disconnect wallet"
        title="Disconnect"
      >
        <LogOut className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
