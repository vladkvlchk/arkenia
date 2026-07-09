"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, SearchX } from "lucide-react";
import {
  AddressChip,
  Button,
  Card,
  Container,
  EmptyState,
  NetworkPill,
  Stat,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { formatUnits } from "viem";
import { fmtNum } from "@/shared/lib/format";
import { TOKEN_SYMBOL } from "@/shared/config";
import { CampaignMonogram, CampaignStatusBadge } from "@/entities/campaign";
import { useWallet } from "@/shared/lib/mock-wallet";
import { useMyPosition } from "@/lib/hooks/campaign";
import { useCampaignView, useCohortsView } from "@/lib/hooks/campaign-data";
import { DepositPanel } from "@/features/believer/deposit-panel";
import { PositionCard } from "@/features/believer/position-card";
import { CohortHoldings } from "@/features/believer/cohort-holdings";
import { AngelConsole } from "@/features/angel/angel-console";
import { ActivityFeed } from "@/features/activity/activity-feed";

// TODO(onchain): replace mock getters with contract/indexer reads for the address param,
// with <Skeleton/> layout while loading.

export default function CampaignPage() {
  const params = useParams();
  const address = (params.address as string).toLowerCase() as `0x${string}`;

  const wallet = useWallet();
  const { campaign, isLoading } = useCampaignView(address);
  const currentCohort = campaign ? BigInt(campaign.cohortCount) : 0n;
  const { cohorts } = useCohortsView(address, wallet.address, currentCohort);
  const { position } = useMyPosition(address, wallet.address, currentCohort);

  const yourPool = position ? Number(formatUnits(position.refundable, 6)) : 0;
  const isAngel =
    !!wallet.address && !!campaign && wallet.address.toLowerCase() === campaign.angel.address.toLowerCase();

  if (isLoading && !campaign) {
    return (
      <Container className="py-20">
        <div className="mx-auto max-w-md p-12 text-center text-[13px] text-ink-muted">Loading campaign…</div>
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
            description={
              <>
                Nothing is deployed at <span className="break-all font-mono">{address}</span> on
                this network.
              </>
            }
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

  const claimableTotal = cohorts.reduce((sum, c) => sum + c.yourClaimable, 0);
  const claimCohortIds = cohorts.filter((c) => c.yourClaimable > 0).map((c) => BigInt(c.index));

  return (
    <Container className="py-8">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Campaigns
      </Link>

      {/* Header */}
      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-start gap-4">
          <CampaignMonogram name={campaign.name} coverUrl={campaign.coverUrl} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">
                {campaign.name}
              </h1>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            <p className="mt-1 max-w-[64ch] text-[13px] leading-5 text-ink-muted">
              {campaign.description}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-subtle">
              <span className="flex items-center gap-1.5">
                Angel
                <AddressChip address={campaign.angel.address} label={campaign.angel.label} variant="plain" />
              </span>
              <span className="flex items-center gap-1.5">
                Contract
                <AddressChip address={campaign.address} variant="plain" />
              </span>
              <NetworkPill />
            </div>
          </div>
        </div>
        <Button variant="secondary" asChild>
          <Link href={`/campaign/${campaign.address}/premarket`}>
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            Premarket
          </Link>
        </Button>
      </div>

      {/* Campaign figures */}
      <Card className="mt-6 grid grid-cols-2 gap-y-6 p-5 sm:p-6 lg:grid-cols-4 lg:divide-x lg:divide-line lg:gap-y-0">
        <Stat label="Pool · refundable" value={fmtNum(campaign.poolBalance)} unit={TOKEN_SYMBOL} size="sm" className="lg:pr-6" />
        <Stat label="Total deposited" value={fmtNum(campaign.totalDeposited)} unit={TOKEN_SYMBOL} size="sm" className="lg:px-6" />
        <Stat
          label={`Deployed · ${campaign.cohortCount} cohorts`}
          value={fmtNum(campaign.totalWithdrawn)}
          unit={TOKEN_SYMBOL}
          size="sm"
          className="lg:px-6"
        />
        <Stat
          label="Returned to cohorts"
          value={fmtNum(campaign.totalReturned)}
          unit={TOKEN_SYMBOL}
          size="sm"
          subtext={
            campaign.totalWithdrawn > 0
              ? `${(campaign.totalReturned / campaign.totalWithdrawn).toFixed(2)}× of deployed`
              : "No deployments yet"
          }
          className="lg:pl-6"
        />
      </Card>

      {/* Role sections */}
      <Tabs defaultValue="believer" className="mt-8">
        <TabsList>
          <TabsTrigger value="believer">Believer</TabsTrigger>
          <TabsTrigger value="angel">Angel console</TabsTrigger>
        </TabsList>

        <TabsContent value="believer" className="mt-6">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <PositionCard
                address={address}
                poolBalance={yourPool}
                claimableTotal={claimableTotal}
                claimCohortIds={claimCohortIds}
              />
              <CohortHoldings address={address} cohorts={cohorts} />
              <ActivityFeed items={[]} />
            </div>
            <div className="space-y-4 lg:sticky lg:top-20">
              <DepositPanel address={address} campaignName={campaign.name} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="angel" className="mt-6">
          <AngelConsole address={address} campaign={campaign} cohorts={cohorts} isAngel={isAngel} />
        </TabsContent>
      </Tabs>
    </Container>
  );
}
