import Link from "next/link";
import { AddressChip, Container, NetworkPill } from "@/shared/ui";
import { ThemeSwitcher } from "@/shared/ui/theme-switcher";
import { FACTORY_ADDRESS, TOKEN_ADDRESS, TOKEN_SYMBOL, IS_TESTNET } from "@/shared/config";

/** Transparency lives in the footer on every page: contracts, network, no fine-print tricks. */
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <div className="font-serif text-lg tracking-tight text-ink">Arkenia</div>
          <p className="max-w-[26ch] text-[13px] leading-5 text-ink-muted">
            Pooled angel investing with refundable deposits and tradeable cohort shares.
          </p>
          <NetworkPill />
        </div>

        <div>
          <div className="t-overline">Product</div>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li><FooterLink href="/campaigns">Campaigns</FooterLink></li>
            <li><FooterLink href="/create">Create a campaign</FooterLink></li>
            {IS_TESTNET && <li><FooterLink href="/faucet">Faucet</FooterLink></li>}
            <li><FooterLink href="/profile/me">Your profile</FooterLink></li>
          </ul>
        </div>

        <div>
          <div className="t-overline">Verify</div>
          <ul className="mt-3 space-y-2.5 text-[13px]">
            <li className="space-y-1">
              <span className="block text-xs text-ink-subtle">Campaign factory</span>
              <AddressChip address={FACTORY_ADDRESS} variant="plain" />
            </li>
            <li className="space-y-1">
              <span className="block text-xs text-ink-subtle">{TOKEN_SYMBOL} token</span>
              <AddressChip address={TOKEN_ADDRESS} variant="plain" />
            </li>
          </ul>
        </div>

        <div>
          <div className="t-overline">Company</div>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li><FooterLink href="/careers">Careers</FooterLink></li>
            <li><FooterLink href="/design">Design system</FooterLink></li>
            <li>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="text-ink-muted transition-colors duration-150 hover:text-ink"
              >
                Source
              </a>
            </li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-line">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs text-ink-subtle">
          <div className="flex flex-wrap items-center gap-3">
            <span>© 2026 Arkenia</span>
            {IS_TESTNET && <span className="font-mono">Testnet preview — no real funds involved.</span>}
          </div>
          <ThemeSwitcher />
        </Container>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-ink-muted transition-colors duration-150 hover:text-ink">
      {children}
    </Link>
  );
}
