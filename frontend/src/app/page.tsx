import Link from "next/link";
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, CornerDownLeft, Layers, ShieldCheck, Scale, DoorOpen } from "lucide-react";
import { AddressChip, Badge, Button, Card, Container, NetworkPill } from "@/shared/ui";
import { FACTORY_ADDRESS, IS_TESTNET, TOKEN_SYMBOL } from "@/shared/config";
import { FeaturedCampaigns } from "@/widgets/featured-campaigns/featured-campaigns";

const STEPS = [
  {
    icon: ArrowDownLeft,
    title: "Deposit",
    body: `Put ${TOKEN_SYMBOL} into a campaign's shared pool. Until it is deployed, refund 1:1 whenever you want.`,
  },
  {
    icon: Layers,
    title: "Cohorts",
    body: "When the angel deploys capital, a cohort is minted and your pool balance converts pro-rata into its shares.",
  },
  {
    icon: CornerDownLeft,
    title: "Returns",
    body: "The angel returns profit to cohorts. Your share is claimable immediately — accounted onchain, to the unit.",
  },
  {
    icon: ArrowLeftRight,
    title: "Premarket",
    body: "Cohort shares trade on a per-cohort order book, so you can exit or increase a position before returns land.",
  },
];

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "Refundable by default",
    body: "Un-deployed deposits are never at risk of discretion — the contract lets you take them back 1:1.",
  },
  {
    icon: Scale,
    title: "Pro-rata, onchain accounting",
    body: "Cohort shares and returns are computed by the contract, not a spreadsheet. Verify every figure on the explorer.",
  },
  {
    icon: DoorOpen,
    title: "Exit on your terms",
    body: "Claim returns as they arrive, or sell cohort shares on the premarket. No lock-ups beyond deployed capital.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-line bg-surface">
        <Container className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <div className="t-overline">Onchain fundraising — Base</div>
            <h1 className="mt-4 max-w-[16ch] text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-5xl">
              Pooled angel investing, refundable until deployed.
            </h1>
            <p className="mt-5 max-w-[52ch] text-[15px] leading-7 text-ink-muted">
              Believers fund a campaign&apos;s shared pool. When the angel deploys capital, deposits
              convert pro-rata into cohort shares that earn returns — and trade on a premarket.
              Everything else stays refundable, 1:1.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link href="/campaigns">
                  Explore campaigns
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <a href="#how-it-works">How it works</a>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-ink-subtle">
              <NetworkPill />
              <span className="flex items-center gap-2">
                Factory
                <AddressChip address={FACTORY_ADDRESS} variant="plain" />
              </span>
            </div>
          </div>

          <FlowCard />
        </Container>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20">
        <Container className="py-16 sm:py-20">
          <div className="t-overline">How it works</div>
          <h2 className="mt-3 max-w-[26ch] text-2xl font-semibold tracking-[-0.01em] text-ink">
            One pool, many cohorts, honest exits.
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={step.title} className="bg-surface p-6">
                <div className="flex items-center justify-between">
                  <step.icon className="h-[18px] w-[18px] text-accent" aria-hidden />
                  <span className="font-mono text-xs text-ink-faint">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-sm font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-5 text-ink-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Principles */}
      <section className="border-y border-line bg-surface">
        <Container className="grid gap-10 py-14 sm:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <div key={p.title}>
              <p.icon className="h-[18px] w-[18px] text-ink-muted" aria-hidden />
              <h3 className="mt-3 text-sm font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-[13px] leading-5 text-ink-muted">{p.body}</p>
            </div>
          ))}
        </Container>
      </section>

      {/* Live campaigns */}
      <section>
        <Container className="py-16 sm:py-20">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="t-overline">Campaigns</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-ink">
                Open now
              </h2>
            </div>
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-accent transition-colors duration-150 hover:text-accent-hover"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <FeaturedCampaigns />
        </Container>
      </section>

      {/* Closing CTA */}
      {IS_TESTNET && (
        <section>
          <Container className="pb-4">
            <Card className="flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">
                    Try it with play money.
                  </h2>
                  <Badge variant="warning">Testnet</Badge>
                </div>
                <p className="mt-2 max-w-[52ch] text-[13px] leading-5 text-ink-muted">
                  This deployment runs on Base Sepolia with faucet {TOKEN_SYMBOL}. Same contracts,
                  same mechanics, zero value at stake.
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <Button variant="secondary" asChild>
                  <Link href="/faucet">Get {TOKEN_SYMBOL}</Link>
                </Button>
                <Button asChild>
                  <Link href="/campaigns">Start exploring</Link>
                </Button>
              </div>
            </Card>
          </Container>
        </section>
      )}
    </>
  );
}

/** Worked example with real arithmetic — the model explained in one card. */
function FlowCard() {
  return (
    <Card className="shadow-md">
      <div className="border-b border-line px-5 py-3.5">
        <span className="t-overline">Worked example</span>
      </div>
      <ol className="px-5">
        <FlowStep
          step="01"
          title="You deposit"
          detail={`Pool holds 100 000 ${TOKEN_SYMBOL} — your share 10%`}
          amount={`+10 000.00 ${TOKEN_SYMBOL}`}
        />
        <FlowStep
          step="02"
          title="Angel deploys 60 000 — Cohort #4 minted"
          detail={`You receive 6 000 shares · 4 000 ${TOKEN_SYMBOL} stays refundable`}
          amount="6 000 shares"
        />
        <FlowStep
          step="03"
          title="Angel returns 18 000 to Cohort #4"
          detail="Distributed pro-rata to shareholders"
          amount={`+1 800.00 ${TOKEN_SYMBOL}`}
          accent
        />
        <FlowStep
          step="04"
          title="Claim — or trade your shares"
          detail="Per-cohort premarket order book"
          amount="bid 1.02 / ask 1.045"
          last
        />
      </ol>
    </Card>
  );
}

function FlowStep({
  step,
  title,
  detail,
  amount,
  accent,
  last,
}: {
  step: string;
  title: string;
  detail: string;
  amount: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <li className={`flex gap-4 py-4 ${last ? "" : "border-b border-line"}`}>
      <span className="mt-0.5 font-mono text-xs text-ink-faint">{step}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium leading-5 text-ink">{title}</div>
        <div className="mt-0.5 text-xs leading-5 text-ink-subtle">{detail}</div>
      </div>
      <span
        className={`shrink-0 self-center font-mono text-[13px] ${accent ? "font-medium text-success" : "text-ink-muted"}`}
      >
        {amount}
      </span>
    </li>
  );
}
