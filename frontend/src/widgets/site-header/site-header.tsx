"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/cn";
import { IS_TESTNET } from "@/shared/config";
import { useWallet } from "@/shared/lib/mock-wallet";
import { ConnectWallet, NetworkPill } from "@/shared/ui";

const NAV = [
  { href: "/campaigns", label: "Campaigns" },
  { href: "/create", label: "Create" },
  ...(IS_TESTNET ? [{ href: "/faucet", label: "Faucet" }] : []),
];

export function SiteHeader() {
  const pathname = usePathname();
  // TODO(onchain): wallet state comes from the Privy adapter instead of the mock provider.
  const wallet = useWallet();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-7">
          <Link href="/" className="flex shrink-0 items-baseline gap-2">
            <span className="font-serif text-[21px] leading-none tracking-tight text-ink">
              Arkenia
            </span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-5">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "text-[13px] font-medium transition-colors duration-150",
                    active ? "text-ink" : "text-ink-muted hover:text-ink"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <NetworkPill className="hidden md:inline-flex" />
          <ConnectWallet wallet={wallet} />
        </div>
      </div>
    </header>
  );
}
