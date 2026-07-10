import Link from "next/link";
import { IS_TESTNET, CHAIN_NAME } from "@/shared/config";

/**
 * Persistent, honest testnet notice. Rendered only when the app targets a testnet.
 */
export function TestnetBanner() {
  if (!IS_TESTNET) return null;

  return (
    <div className="border-b border-warning/15 bg-warning-soft">
      <div className="mx-auto flex h-8 max-w-6xl items-center justify-center gap-2 px-4 font-mono text-2xs text-warning">
        <span className="font-medium tracking-[0.08em]">TESTNET</span>
        <span aria-hidden className="opacity-40">·</span>
        <span className="truncate">{CHAIN_NAME} — funds here are valueless test tokens</span>
        <span aria-hidden className="opacity-40">·</span>
        <Link href="/faucet" className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80">
          Get tUSDC
        </Link>
      </div>
    </div>
  );
}
