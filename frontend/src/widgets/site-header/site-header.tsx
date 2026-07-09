"use client";

import Link from "next/link";
import { useWallet } from "@/shared/lib/mock-wallet";
import { ConnectWallet, NetworkPill } from "@/shared/ui";

export function SiteHeader() {
  const wallet = useWallet();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-baseline gap-2">
          <span className="font-serif text-[21px] leading-none tracking-tight text-ink">Arkenia</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <NetworkPill />
          <ConnectWallet wallet={wallet} />
        </div>
      </div>
    </header>
  );
}
