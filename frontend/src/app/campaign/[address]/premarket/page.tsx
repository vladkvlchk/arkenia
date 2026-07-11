"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePublicClient } from "wagmi";
import { ArrowLeft, SearchX } from "lucide-react";
import {
  Button,
  Card,
  Container,
  EmptyState,
  Skeleton,
  Stat,
  Tabs,
  TabsList,
  TabsTrigger,
  useToast,
} from "@/shared/ui";
import { useWallet } from "@/shared/lib/mock-wallet";
import { fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import { CampaignMonogram } from "@/entities/campaign";
import type { OpenOrder, OrderBook } from "@/entities/market";
import { OrderBookPanel } from "@/features/premarket/order-book-panel";
import { OrderTicket } from "@/features/premarket/order-ticket";
import { OpenOrders } from "@/features/premarket/open-orders";
import { MarketOrders } from "@/features/premarket/market-orders";
import { RecentTrades } from "@/features/premarket/recent-trades";
import { useCampaignView, useCohortsView } from "@/lib/hooks/campaign-data";
import { useApiOrderBook } from "@/lib/hooks/api";
import { usePremarket, type Order as SignedOrder } from "@/lib/hooks/premarket";

type Addr = `0x${string}`;

export default function PremarketPage() {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as Addr;
  const wallet = useWallet();
  const { toast } = useToast();
  const publicClient = usePublicClient();
  const premarket = usePremarket(address);

  const { campaign, isLoading: loadingCampaign } = useCampaignView(address);
  const currentCohort = campaign?.cohortCount ?? 0;
  const { cohorts } = useCohortsView(
    campaign ? address : undefined,
    wallet.address as Addr | undefined,
    BigInt(currentCohort)
  );
  const [selected, setSelected] = useState<number | null>(null);
  const cohortIndex = selected ?? Math.max(currentCohort, 1); // default to the newest cohort
  const cohort = cohorts.find((c) => c.index === cohortIndex);

  const { data: bookData } = useApiOrderBook(campaign ? address : undefined, cohortIndex);

  // ── indexer-lag masking: fills/cancels land on-chain instantly but reach the
  // backend ~15s later. Hide cancelled ids and subtract taken shares locally;
  // masks prune themselves once the server reflects them.
  const [cancelledIds, setCancelledIds] = useState<ReadonlySet<string>>(new Set());
  const [takenById, setTakenById] = useState<ReadonlyMap<string, number>>(new Map());
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const liveOrders = useMemo(() => {
    const serverOrders = bookData?.orders ?? [];
    return serverOrders
      .filter((o) => !cancelledIds.has(o.id))
      .map((o) => {
        const taken = takenById.get(o.id) ?? 0;
        return taken > 0 ? { ...o, remaining: Math.max(0, o.remaining - taken) } : o;
      })
      .filter((o) => o.remaining > 0);
  }, [bookData?.orders, cancelledIds, takenById]);

  // Prune masks once the backend caught up (order gone / fill reflected).
  const serverOrders = bookData?.orders;
  useEffect(() => {
    if (!serverOrders) return;
    const ids = new Set(serverOrders.map((o) => o.id));
    if ([...cancelledIds].some((id) => !ids.has(id))) {
      setCancelledIds(new Set([...cancelledIds].filter((id) => ids.has(id))));
    }
    const next = new Map(takenById);
    let changed = false;
    for (const [id, taken] of takenById) {
      const server = serverOrders.find((o) => o.id === id);
      if (!server || server.size - server.remaining >= taken) {
        next.delete(id);
        changed = true;
      }
    }
    if (changed) setTakenById(next);
  }, [serverOrders]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = wallet.address?.toLowerCase();
  const myOrders: OpenOrder[] = liveOrders
    .filter((o) => o.maker.toLowerCase() === me)
    .map((o) => ({
      id: o.id,
      campaignAddress: o.campaignAddress,
      campaignName: campaign?.name ?? "",
      cohortIndex: o.cohortIndex,
      side: o.side,
      price: o.price,
      size: o.size,
      filled: o.filled,
      placedAt: o.placedAt,
    }));
  const marketOrders = liveOrders.filter((o) => o.maker.toLowerCase() !== me);

  // Aggregate the masked orders into book levels so every panel agrees.
  const book: OrderBook = useMemo(() => {
    const levels = (side: "bid" | "ask") => {
      const byPrice = new Map<number, number>();
      for (const o of liveOrders) {
        if (o.side !== side) continue;
        byPrice.set(o.price, (byPrice.get(o.price) ?? 0) + o.remaining);
      }
      return [...byPrice.entries()].map(([price, size]) => ({ price, size }));
    };
    return {
      campaignAddress: address,
      cohortIndex,
      bids: levels("bid").sort((a, b) => b.price - a.price),
      asks: levels("ask").sort((a, b) => a.price - b.price),
      ...(bookData?.book.lastPrice !== undefined ? { lastPrice: bookData.book.lastPrice } : {}),
    };
  }, [liveOrders, address, cohortIndex, bookData?.book.lastPrice]);

  const trades = (bookData?.trades ?? []).map((t) => ({
    id: t.id,
    side: t.side,
    price: t.price,
    size: t.size,
    at: t.at,
  }));

  async function cancelOrder(order: OpenOrder) {
    const full = liveOrders.find((o) => o.id === order.id);
    if (!full) return;
    setCancellingId(order.id);
    try {
      const o = full.fill.order;
      const struct: SignedOrder = {
        maker: o.maker,
        isSell: o.isSell,
        cohortId: BigInt(o.cohortId),
        shareAmount: BigInt(o.shareAmount),
        usdcAmount: BigInt(o.usdcAmount),
        nonce: BigInt(o.nonce),
        deadline: BigInt(o.deadline),
      };
      const txHash = await premarket.cancelOrder(struct);
      await publicClient?.waitForTransactionReceipt({ hash: txHash });
      setCancelledIds(new Set([...cancelledIds, order.id]));
      toast({
        title: "Order cancelled",
        description: `${order.side === "bid" ? "Bid" : "Ask"} for ${fmtNum(order.size - order.filled)} shares of Cohort #${order.cohortIndex} withdrawn on-chain.`,
        intent: "success",
        txHash,
      });
    } catch (e) {
      toast({
        title: "Cancel failed",
        description:
          (e as { shortMessage?: string }).shortMessage ??
          (e instanceof Error ? e.message : "The transaction was rejected."),
        intent: "danger",
      });
    } finally {
      setCancellingId(null);
    }
  }

  if (loadingCampaign) {
    return (
      <Container className="py-8">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-6 h-10 w-64" />
        <Skeleton className="mt-6 h-24 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </Container>
    );
  }

  if (!campaign) {
    return (
      <Container className="py-20">
        <div className="mx-auto max-w-md rounded-lg border border-line bg-surface">
          <EmptyState
            icon={SearchX}
            title="Campaign not found"
            description="No premarket exists at this address on this network."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link href="/campaigns">Back to campaigns</Link>
              </Button>
            }
          />
        </div>
      </Container>
    );
  }

  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;

  return (
    <Container className="py-8">
      <Link
        href={`/campaign/${campaign.address}`}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {campaign.name}
      </Link>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CampaignMonogram name={campaign.name} coverUrl={campaign.coverUrl} />
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-ink">Premarket</h1>
            <p className="text-[13px] text-ink-muted">
              Per-cohort share order book · settles in {TOKEN_SYMBOL}
            </p>
          </div>
        </div>

        {currentCohort > 0 && (
          <Tabs value={String(cohortIndex)} onValueChange={(v) => setSelected(Number(v))}>
            <TabsList variant="segmented">
              {Array.from({ length: currentCohort }, (_, i) => i + 1).map((i) => (
                <TabsTrigger key={i} value={String(i)}>
                  Cohort #{i}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      {currentCohort === 0 ? (
        <div className="mt-6 rounded-lg border border-line bg-surface">
          <EmptyState
            title="No cohorts to trade yet"
            description="The premarket opens per cohort. Once the angel deploys pooled capital, that cohort's shares become tradeable here."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/campaign/${campaign.address}`}>Back to campaign</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <Card className="mt-6 grid grid-cols-2 gap-y-6 p-5 sm:grid-cols-4 sm:divide-x sm:divide-line sm:gap-y-0">
            <Stat
              label="Last price"
              value={book.lastPrice !== undefined ? book.lastPrice.toFixed(3) : "—"}
              unit={TOKEN_SYMBOL}
              size="sm"
              className="sm:pr-6"
            />
            <Stat
              label="Best bid"
              value={bestBid !== undefined ? bestBid.toFixed(3) : "—"}
              size="sm"
              className="sm:px-6"
            />
            <Stat
              label="Best ask"
              value={bestAsk !== undefined ? bestAsk.toFixed(3) : "—"}
              size="sm"
              className="sm:px-6"
            />
            <Stat
              label="Your shares"
              value={cohort ? fmtNum(cohort.yourShares) : "0"}
              size="sm"
              className="sm:pl-6"
            />
          </Card>

          <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <OrderBookPanel book={book} />
              <MarketOrders
                campaign={address}
                orders={marketOrders}
                yourShares={cohort?.yourShares ?? 0}
                onFilled={(orderId, shares) =>
                  setTakenById(new Map(takenById).set(orderId, (takenById.get(orderId) ?? 0) + shares))
                }
              />
              <OpenOrders orders={myOrders} onCancel={cancelOrder} cancellingId={cancellingId} />
              <RecentTrades trades={trades} />
            </div>
            <div className="lg:sticky lg:top-20">
              <OrderTicket
                campaign={address}
                cohortIndex={cohortIndex}
                currentCohort={currentCohort}
                yourShares={cohort?.yourShares ?? 0}
              />
            </div>
          </div>
        </>
      )}
    </Container>
  );
}
