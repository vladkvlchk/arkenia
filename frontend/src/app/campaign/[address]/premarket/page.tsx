"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import {
  Button,
  Card,
  Container,
  EmptyState,
  Stat,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import { CampaignMonogram, getCampaign, getCohorts } from "@/entities/campaign";
import { getOrderBook, MOCK_OPEN_ORDERS, MOCK_TRADES } from "@/entities/market";
import { OrderBookPanel } from "@/features/premarket/order-book-panel";
import { OrderTicket } from "@/features/premarket/order-ticket";
import { OpenOrders } from "@/features/premarket/open-orders";
import { RecentTrades } from "@/features/premarket/recent-trades";

// TODO(onchain): replace mock books/orders/trades with premarket contract + indexer reads.

export default function PremarketPage() {
  const params = useParams();
  const address = params.address as string;

  const campaign = getCampaign(address);
  const cohorts = getCohorts(address);
  const [cohortIndex, setCohortIndex] = useState(cohorts.at(-1)?.index ?? 1);

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

  const book = getOrderBook(address, cohortIndex);
  const cohort = cohorts.find((c) => c.index === cohortIndex);
  const bestBid = book?.bids[0]?.price;
  const bestAsk = book?.asks[0]?.price;
  const openOrders = MOCK_OPEN_ORDERS.filter(
    (o) => o.campaignAddress.toLowerCase() === address.toLowerCase()
  );

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

        {cohorts.length > 0 && (
          <Tabs value={String(cohortIndex)} onValueChange={(v) => setCohortIndex(Number(v))}>
            <TabsList variant="segmented">
              {cohorts.map((c) => (
                <TabsTrigger key={c.index} value={String(c.index)}>
                  Cohort #{c.index}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>

      {cohorts.length === 0 ? (
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
              value={book?.lastPrice !== undefined ? book.lastPrice.toFixed(3) : "—"}
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
              <OpenOrders orders={openOrders} />
              <RecentTrades trades={MOCK_TRADES} />
            </div>
            <div className="lg:sticky lg:top-20">
              <OrderTicket cohortIndex={cohortIndex} yourShares={cohort?.yourShares ?? 0} />
            </div>
          </div>
        </>
      )}
    </Container>
  );
}
