"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import {
  AddressChip,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  Dialog,
  DialogBody,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Meter,
  NetworkPill,
  NumberInput,
  ConnectWallet,
  Pagination,
  SearchField,
  Skeleton,
  Stat,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TBody,
  Td,
  Th,
  THead,
  TokenAmount,
  Tr,
  useToast,
} from "@/shared/ui";
import type { WalletView } from "@/shared/lib/mock-wallet";
import { CampaignCard, LedgerGrid, MOCK_CAMPAIGNS, type Campaign } from "@/entities/campaign";
import { fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";

/** Living reference for the Arkenia design system. Companion to frontend/DESIGN.md. */

const noop = () => {};
const walletStates: { title: string; view: WalletView }[] = [
  {
    title: "Disconnected",
    view: { status: "disconnected", connect: noop, disconnect: noop, switchNetwork: noop },
  },
  {
    title: "Connecting",
    view: { status: "connecting", connect: noop, disconnect: noop, switchNetwork: noop },
  },
  {
    title: "Wrong network",
    view: {
      status: "wrong-network",
      address: "0x3E8dAb1f5F9E2Cc74C0e5B71a9B4D0662a10F21b",
      connect: noop,
      disconnect: noop,
      switchNetwork: noop,
    },
  },
  {
    title: "Connected",
    view: {
      status: "connected",
      address: "0x3E8dAb1f5F9E2Cc74C0e5B71a9B4D0662a10F21b",
      tokenBalance: 8750,
      connect: noop,
      disconnect: noop,
      switchNetwork: noop,
    },
  },
];

const swatches = [
  { name: "bg", cls: "bg-bg border border-line" },
  { name: "surface", cls: "bg-surface border border-line" },
  { name: "surface-2", cls: "bg-surface-2 border border-line" },
  { name: "line", cls: "bg-line" },
  { name: "ink", cls: "bg-ink" },
  { name: "ink-muted", cls: "bg-ink-muted" },
  { name: "ink-subtle", cls: "bg-ink-subtle" },
  { name: "accent", cls: "bg-accent" },
  { name: "accent-soft", cls: "bg-accent-soft" },
  { name: "success", cls: "bg-success" },
  { name: "warning", cls: "bg-warning" },
  { name: "danger", cls: "bg-danger" },
  { name: "info", cls: "bg-info" },
];

/** A first-week campaign: exactly five squares of belief. */
const DEMO_TINY: Campaign = {
  address: "0x1111111111111111111111111111111111111111",
  name: "Vesper Field Notes",
  description: "Brand-new campaign — the ledger page is still almost blank.",
  angel: { address: "0x71b3e5d9a2c6f0b4d8e1a5c9f3b7d0e4a8c2f6b1" },
  status: "open",
  poolBalance: 500,
  totalDeposited: 500,
  totalWithdrawn: 0,
  totalReturned: 0,
  cohortCount: 0,
  believers: 5,
  createdAt: "2026-07-01T09:00:00Z",
};

const demoByName = (name: string) => MOCK_CAMPAIGNS.find((c) => c.name === name)!;

export default function DesignPage() {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  // Log slider 0..100 → 100..1 000 000 raised.
  const [magnitude, setMagnitude] = useState(55);
  const [returnedPct, setReturnedPct] = useState(0);
  const [demoQuery, setDemoQuery] = useState("");
  const [demoPage, setDemoPage] = useState(4);
  const playRaised = Math.round(100 * Math.pow(10, magnitude / 25));
  const playReturned = Math.round((playRaised * returnedPct) / 100);

  return (
    <Container className="space-y-12 py-12">
      <div>
        <div className="t-overline">Reference</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.01em]">Design system</h1>
        <p className="mt-1 max-w-[64ch] text-[13px] text-ink-muted">
          Tokens and components used across Arkenia. Toggle the theme in the header — everything
          here is theme-aware. Usage notes live in <span className="font-mono">frontend/DESIGN.md</span>.
        </p>
      </div>

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {swatches.map((s) => (
            <div key={s.name}>
              <div className={`h-12 rounded-md ${s.cls}`} />
              <div className="mt-1.5 font-mono text-2xs text-ink-muted">{s.name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="space-y-4">
          <div className="font-serif text-3xl tracking-tight">Arkenia — wordmark serif only</div>
          <div className="text-2xl font-semibold tracking-[-0.01em]">Page title / 24 semibold</div>
          <div className="text-[15px] leading-7 text-ink-muted">
            Body / IBM Plex Sans 15 — calm, precise sentences. Numbers in prose stay tabular: 1 024.
          </div>
          <div className="font-mono text-sm">
            Mono for on-chain data: 0xa71a…f2ad · 402 910.00 tUSDC · 1.045
          </div>
          <div className="t-overline">Overline label / mono 11 caps</div>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Badges & pills">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="success" dot>Open</Badge>
          <Badge variant="info" dot>Returning</Badge>
          <Badge variant="neutral" dot>Closed</Badge>
          <Badge variant="warning">Testnet</Badge>
          <Badge variant="danger">Ask</Badge>
          <Badge variant="accent">Deposit</Badge>
          <Badge variant="outline">Outline</Badge>
          <NetworkPill />
        </div>
      </Section>

      <Section title="Stat / TokenAmount / AddressChip / Meter">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Pool · refundable" value="402 910" unit="tUSDC" size="md" delta={4.2} subtext="Since last cohort" />
          <div className="space-y-2">
            <TokenAmount value={1250} className="block text-xl" />
            <TokenAmount value={-320.5} signed className="block" />
            <TokenAmount value={57600} precision="auto" muted className="block" />
          </div>
          <div className="space-y-2">
            <AddressChip address="0xa71a3ae1bbbd6d82e5b6f9c22f1c5da75c3bf2ad" />
            <AddressChip address="0x8c1e4bd0aa7c2f9e33d05b6a91c4e7f2d8b0a3c5" label="atlas.base.eth" />
            <AddressChip address="0x54f7a9c2e8d1b3f6a0c5d9e2b7f4a1c8d3e6f0b2" variant="plain" />
          </div>
          <div className="space-y-3 self-center">
            <Meter value={0.53} label="Pool deployed" />
            <Meter value={0.86} label="Cohort filled" />
          </div>
        </div>
      </Section>

      <Section title="Campaign cards — the ledger grid">
        <p className="max-w-[72ch] text-[13px] leading-5 text-ink-muted">
          One square = 100 {TOKEN_SYMBOL} raised. The grain steps down as a campaign grows —
          chunky tokens for a first-week raise, fine sediment past 100k. When even the finest
          grain can’t fit the band, the unit escalates ×10 and the legend says so. Hollow
          squares are capital already returned; the dotted lattice is unwritten paper. Hover
          the grid for totals.
        </p>

        <div className="mt-5 space-y-4">
          {/* Variant "split" — half-width plate column, featured infill. */}
          <CampaignCard campaign={demoByName("Atlas Deep Compute")} variant="split" featured />

          {/* Variant "banner" — full-width frontispiece, across four magnitudes. */}
          <div className="grid gap-4 md:grid-cols-2">
            <CampaignCard campaign={DEMO_TINY} />
            <CampaignCard campaign={demoByName("Nimbus Bio Syndicate")} />
            <CampaignCard campaign={demoByName("Helio Grid Storage")} />
            <CampaignCard campaign={demoByName("Kestrel Frontier")} />
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="t-overline">Scale playground</span>
            <span className="font-mono text-sm text-ink">
              {fmtNum(playRaised)} {TOKEN_SYMBOL}
              {playReturned > 0 && (
                <span className="text-ink-subtle"> · {fmtNum(playReturned)} returned</span>
              )}
            </span>
          </div>
          <LedgerGrid raised={playRaised} returned={playReturned} height={88} className="mt-4" />
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="t-overline">Raised — drag to rescale</span>
              <input
                type="range"
                min={0}
                max={100}
                value={magnitude}
                onChange={(e) => setMagnitude(Number(e.target.value))}
                className="mt-2 w-full accent-ink"
              />
            </label>
            <label className="block">
              <span className="t-overline">Returned share — {returnedPct}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={returnedPct}
                onChange={(e) => setReturnedPct(Number(e.target.value))}
                className="mt-2 w-full accent-ink"
              />
            </label>
          </div>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <NumberInput
            label="Amount"
            value={amount}
            onChange={setAmount}
            suffix="tUSDC"
            balance={8750}
          />
          <NumberInput
            label="With error"
            value="9999999"
            onChange={noop}
            suffix="tUSDC"
            error="Exceeds your balance of 8 750.00 tUSDC"
          />
        </div>
      </Section>

      <Section title="Search & pagination">
        <div className="max-w-2xl space-y-5">
          <SearchField
            value={demoQuery}
            onChange={setDemoQuery}
            placeholder="Search campaigns, angels, addresses…"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <span className="t-overline">37–48 of 120</span>
            <Pagination page={demoPage} pageCount={10} onPageChange={setDemoPage} />
          </div>
        </div>
      </Section>

      <Section title="Tabs">
        <div className="space-y-6">
          <Tabs defaultValue="believer">
            <TabsList>
              <TabsTrigger value="believer">Believer</TabsTrigger>
              <TabsTrigger value="angel">Angel console</TabsTrigger>
            </TabsList>
            <TabsContent value="believer" className="pt-4 text-[13px] text-ink-muted">
              Underline variant — page-level sections.
            </TabsContent>
            <TabsContent value="angel" className="pt-4 text-[13px] text-ink-muted">
              Angel-side controls.
            </TabsContent>
          </Tabs>
          <Tabs defaultValue="bid">
            <TabsList variant="segmented">
              <TabsTrigger value="bid">Buy</TabsTrigger>
              <TabsTrigger value="ask">Sell</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Section>

      <Section title="Dialog & Toast">
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Review deposit</DialogTitle>
                <DialogDescription>Nothing is signed until you confirm.</DialogDescription>
              </DialogHeader>
              <DialogBody className="text-sm text-ink-muted">
                Every irreversible action gets a review step with the full amounts spelled out.
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button>Confirm</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Deposit submitted",
                description: "5 000.00 tUSDC to Atlas Deep Compute.",
                intent: "success",
                txHash: "0x7d3f2a8c5e1b9d4f6a0c3e7b2d8f5a1c9e4b6d0a3f7c2e8b5d1a9f4c6e0b3d7a",
              })
            }
          >
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Transaction failed",
                description: "Insufficient allowance — approve tUSDC first.",
                intent: "danger",
              })
            }
          >
            Error toast
          </Button>
        </div>
      </Section>

      <Section title="Wallet states">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {walletStates.map((s) => (
            <Card key={s.title}>
              <CardBody className="flex min-h-[92px] flex-col items-start justify-between gap-3">
                <span className="t-overline">{s.title}</span>
                <ConnectWallet wallet={s.view} />
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Table">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
          <Table>
            <THead>
              <Tr className="hover:bg-transparent">
                <Th>Cohort</Th>
                <Th numeric>Share supply</Th>
                <Th numeric>Returned</Th>
                <Th numeric>Multiple</Th>
              </Tr>
            </THead>
            <TBody>
              <Tr>
                <Td className="font-medium">#1</Td>
                <Td numeric>150 000</Td>
                <Td numeric>45 000.00</Td>
                <Td numeric>0.30×</Td>
              </Tr>
              <Tr>
                <Td className="font-medium">#3</Td>
                <Td numeric>96 000</Td>
                <Td numeric>57 600.00</Td>
                <Td numeric>0.60×</Td>
              </Tr>
            </TBody>
          </Table>
        </div>
      </Section>

      <Section title="Loading & empty">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Skeleton</CardTitle>
              <CardDescription>Shapes mirror the loaded layout.</CardDescription>
            </CardHeader>
            <CardBody className="space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </CardBody>
          </Card>
          <Card>
            <EmptyState
              icon={Inbox}
              title="No open orders"
              description="Orders you place rest here until they fill or you cancel them."
              action={<Button variant="secondary" size="sm">Place an order</Button>}
            />
          </Card>
        </div>
      </Section>
    </Container>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="t-overline">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
