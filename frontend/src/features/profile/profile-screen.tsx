"use client";

import Link from "next/link";
import { ArrowUpRight, History, Wallet2 } from "lucide-react";
import {
  AddressChip,
  Badge,
  Button,
  Card,
  Container,
  EmptyState,
  NetworkPill,
  Stat,
  Table,
  TabsContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TBody,
  Td,
  Th,
  THead,
  TokenAmount,
  Tr,
} from "@/shared/ui";
import { useWallet } from "@/shared/lib/mock-wallet";
import { fmtDate, fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import type { ActivityType } from "@/entities/campaign";
import { OpenOrders } from "@/features/premarket/open-orders";
import { useApiAccountActivity, useApiAccountPositions } from "@/lib/hooks/api";
import { seedMeta } from "@/lib/metadata";
import { useClaimAll } from "./use-claim-all";

type BadgeConfig = { label: string; variant: "success" | "neutral" | "info" | "accent" };

const activityBadge: Record<ActivityType, BadgeConfig> = {
  deposit: { label: "Deposit", variant: "accent" },
  withdraw: { label: "Deploy", variant: "info" },
  return: { label: "Return", variant: "success" },
  claim: { label: "Claim", variant: "success" },
  refund: { label: "Refund", variant: "neutral" },
};

/**
 * History rows come from the indexer unvalidated, so `type` is only a
 * compile-time union. A value this table has not been taught yet falls back to
 * its own name rather than taking the whole tab down with it.
 */
function ActivityBadge({ type }: { type: ActivityType }) {
  const { label, variant } = activityBadge[type] ?? { label: type, variant: "neutral" };
  return <Badge variant={variant}>{label}</Badge>;
}

function activityDetail(type: ActivityType, cohortIndex?: number): string {
  switch (type) {
    case "deposit":
      return "Pool";
    case "refund":
      return "Pool · 1:1";
    case "withdraw":
      return `Cohort #${cohortIndex} minted`;
    default:
      return `Cohort #${cohortIndex}`;
  }
}

interface ProfileScreenProps {
  /** When set, renders a read-only view of another account. */
  address?: string;
}

export function ProfileScreen({ address }: ProfileScreenProps) {
  const wallet = useWallet();
  const isSelf = !address;
  const viewedAddress = (address ?? wallet.address) as `0x${string}` | undefined;

  const { data: rawPositions = [] } = useApiAccountPositions(viewedAddress);
  const { data: history = [] } = useApiAccountActivity(viewedAddress);
  // Claimed amounts are masked until the indexer reflects them, so render from these.
  const { positions, claimAll, claiming, progress, txCount } = useClaimAll(rawPositions);

  if (isSelf && wallet.status !== "connected") {
    return (
      <Container className="py-20">
        <div className="mx-auto max-w-md rounded-lg border border-line bg-surface">
          <EmptyState
            icon={Wallet2}
            title="Connect to see your profile"
            description="Your pool balances, cohort shares, claimable returns and history live here."
            action={
              <Button onClick={wallet.connect} loading={wallet.status === "connecting"}>
                Connect wallet
              </Button>
            }
          />
        </div>
      </Container>
    );
  }

  const totalPool = positions.reduce((s, p) => s + p.refundable, 0);
  const totalClaimable = positions.reduce((s, p) => s + p.totalClaimable, 0);
  const cohorts = positions.flatMap((p) => p.cohorts);
  const totalShares = cohorts.reduce((s, c) => s + c.shares, 0);
  const cohortCount = cohorts.length;

  const nameByAddr = new Map(positions.map((p) => [p.campaignAddress.toLowerCase(), p.campaignName]));
  const campaignLabel = (addr: string) =>
    nameByAddr.get(addr.toLowerCase()) ??
    seedMeta(addr)?.name ??
    `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-md border border-line bg-surface-2 font-mono text-xs text-ink-subtle"
          >
            0x
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">
              {isSelf ? "Your profile" : "Profile"}
            </h1>
            {viewedAddress && <AddressChip address={viewedAddress} variant="plain" className="mt-0.5" />}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isSelf && wallet.tokenBalance !== undefined && (
            <span className="text-[13px] text-ink-muted">
              Wallet <TokenAmount value={wallet.tokenBalance} className="text-ink" />
            </span>
          )}
          <NetworkPill />
        </div>
      </div>

      <Card className="mt-6 grid grid-cols-1 gap-y-6 p-5 sm:grid-cols-3 sm:divide-x sm:divide-line sm:gap-y-0 sm:p-6">
        <Stat label="Pool · refundable" value={fmtNum(totalPool)} unit={TOKEN_SYMBOL} size="sm" className="sm:pr-6" />
        <Stat
          label="Cohort shares"
          value={fmtNum(totalShares)}
          size="sm"
          subtext={`Across ${cohortCount} cohorts · ${positions.length} campaigns`}
          className="sm:px-6"
        />
        <div className="sm:pl-6">
          <Stat
            label="Claimable now"
            value={fmtNum(totalClaimable)}
            unit={TOKEN_SYMBOL}
            size="sm"
            className="text-success"
          />
          {isSelf && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button
                size="sm"
                onClick={claimAll}
                loading={claiming}
                disabled={totalClaimable <= 0}
              >
                {claiming && progress
                  ? `Claiming ${Math.min(progress.done + 1, progress.total)}/${progress.total}…`
                  : "Claim all"}
              </Button>
              {txCount > 1 && !claiming && (
                <span className="text-xs text-ink-subtle">
                  {txCount} transactions — one per campaign
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      <Tabs defaultValue="positions" className="mt-8">
        <TabsList>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="orders">Open orders</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="mt-6">
          {positions.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface">
              <EmptyState
                title="No positions yet"
                description="Deposit into a campaign to build a position."
                action={
                  <Button variant="secondary" size="sm" asChild>
                    <Link href="/campaigns">Browse campaigns</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
              <Table>
                <THead>
                  <Tr className="hover:bg-transparent">
                    <Th>Campaign</Th>
                    <Th numeric>Pool balance</Th>
                    <Th>Cohort shares</Th>
                    <Th numeric>Claimable</Th>
                    <Th aria-label="Open" />
                  </Tr>
                </THead>
                <TBody>
                  {positions.map((p) => (
                    <Tr key={p.campaignAddress}>
                      <Td className="font-medium text-ink">{p.campaignName}</Td>
                      <Td numeric>
                        <TokenAmount value={p.refundable} />
                      </Td>
                      <Td className="font-mono text-[13px] text-ink-muted">
                        {p.cohorts.length > 0
                          ? p.cohorts.map((c) => `#${c.index} · ${fmtNum(c.shares)}`).join("   ")
                          : "—"}
                      </Td>
                      <Td numeric>
                        {p.totalClaimable > 0 ? (
                          <TokenAmount value={p.totalClaimable} className="text-success" />
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td numeric className="py-2">
                        <Button variant="ghost" size="icon-sm" asChild>
                          <Link href={`/campaign/${p.campaignAddress}`} aria-label={`Open ${p.campaignName}`}>
                            <ArrowUpRight className="h-4 w-4" aria-hidden />
                          </Link>
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          {/* TODO(premarket): a cross-campaign "my open orders" endpoint feeds this. */}
          <OpenOrders orders={[]} showMarket />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          {history.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface">
              <EmptyState
                icon={History}
                title="No history yet"
                description="Deposits, refunds, claims and returns will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
              <Table>
                <THead>
                  <Tr className="hover:bg-transparent">
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Campaign</Th>
                    <Th>Detail</Th>
                    <Th numeric>Amount</Th>
                  </Tr>
                </THead>
                <TBody>
                  {history.map((h) => (
                    <Tr key={h.id}>
                      <Td className="text-ink-muted">{fmtDate(h.at)}</Td>
                      <Td>
                        <ActivityBadge type={h.type} />
                      </Td>
                      <Td className="font-medium text-ink">{campaignLabel(h.campaignAddress)}</Td>
                      <Td className="text-[13px] text-ink-muted">{activityDetail(h.type, h.cohortIndex)}</Td>
                      <Td numeric>
                        <TokenAmount value={h.amount} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </Container>
  );
}
