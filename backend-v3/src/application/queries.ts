/**
 * Read-side queries: compose stored aggregates with the domain's read-time
 * views (lazy-settlement aware) into shapes the DTO layer serialises.
 */

import { DomainError } from "../domain/errors.js";
import { cohortSharesOf, pendingRewardOf, refundableOf } from "../domain/projection.js";
import type {
  ActivityEntry,
  Address,
  CampaignMetadata,
  CampaignState,
  CohortState,
} from "../domain/types.js";
import type { CampaignQueryStore, MetadataStore } from "./ports.js";

export interface CampaignView {
  campaign: CampaignState;
  metadata: CampaignMetadata;
}

export interface CohortView {
  cohort: CohortState;
  /** Viewer-specific (zero when no account was supplied). */
  yourShares: bigint;
  yourClaimable: bigint;
}

export interface AccountCampaignPosition {
  campaign: CampaignState;
  metadata: CampaignMetadata;
  /** Refundable pool balance (settle-aware view, poolTotal-clamped). */
  refundable: bigint;
  /** Realised, unclaimed reward not attributed to a single cohort. */
  accrued: bigint;
  cohorts: { cohortId: number; shares: bigint; claimable: bigint }[];
  totalClaimable: bigint;
}

export class Queries {
  constructor(
    private readonly store: CampaignQueryStore,
    private readonly metadata: MetadataStore,
    private readonly chainId: number
  ) {}

  async listCampaigns(): Promise<CampaignView[]> {
    const campaigns = await this.store.listCampaigns(this.chainId);
    return Promise.all(
      campaigns.map(async (campaign) => ({
        campaign,
        metadata: await this.metadataOf(campaign.address),
      }))
    );
  }

  async getCampaign(address: Address): Promise<CampaignView> {
    const campaign = await this.store.getCampaign(address);
    if (!campaign) throw new DomainError("unknown_campaign", `campaign ${address} is not indexed`);
    return { campaign, metadata: await this.metadataOf(address) };
  }

  /** Cohorts of a campaign; viewer columns filled when `account` is given. */
  async getCohorts(address: Address, account?: Address): Promise<CohortView[]> {
    const campaign = await this.store.getCampaign(address);
    if (!campaign) throw new DomainError("unknown_campaign", `campaign ${address} is not indexed`);
    const cohorts = await this.store.listCohorts(address);
    if (!account) {
      return cohorts.map((cohort) => ({ cohort, yourShares: 0n, yourClaimable: 0n }));
    }

    const position = (await this.store.getPosition(address, account)) ?? {
      campaign: address,
      account,
      poolBalance: 0n,
      settledUpTo: 0,
      accruedReward: 0n,
    };
    const shareRows = await this.store.listSharesForAccount(address, account);
    const byId = new Map(shareRows.map((s) => [s.cohortId, s]));
    const refs = cohorts.map((c) => ({
      cohortId: c.cohortId,
      fractionRay: c.fractionRay,
      globalAccAtBirthRay: c.globalAccAtBirthRay,
    }));

    return cohorts.map((cohort) => {
      const materialised = byId.get(cohort.cohortId);
      return {
        cohort,
        yourShares: cohortSharesOf(position, materialised?.shares ?? 0n, refs, cohort.cohortId),
        yourClaimable: pendingRewardOf(position, materialised, refs, cohort, campaign.globalAccRay),
      };
    });
  }

  async campaignActivity(address: Address, limit: number): Promise<ActivityEntry[]> {
    const campaign = await this.store.getCampaign(address);
    if (!campaign) throw new DomainError("unknown_campaign", `campaign ${address} is not indexed`);
    return this.store.listActivityForCampaign(address, limit);
  }

  async accountActivity(account: Address, limit: number): Promise<ActivityEntry[]> {
    return this.store.listActivityForAccount(account, limit);
  }

  async accountPositions(account: Address): Promise<AccountCampaignPosition[]> {
    const addresses = await this.store.listCampaignsForAccount(account);
    const out: AccountCampaignPosition[] = [];

    for (const address of addresses) {
      const campaign = await this.store.getCampaign(address);
      if (!campaign) continue;
      const position = (await this.store.getPosition(address, account)) ?? {
        campaign: address,
        account,
        poolBalance: 0n,
        settledUpTo: 0,
        accruedReward: 0n,
      };
      const cohorts = await this.store.listCohorts(address);
      const shareRows = await this.store.listSharesForAccount(address, account);
      const byId = new Map(shareRows.map((s) => [s.cohortId, s]));
      const refs = cohorts.map((c) => ({
        cohortId: c.cohortId,
        fractionRay: c.fractionRay,
        globalAccAtBirthRay: c.globalAccAtBirthRay,
      }));

      const perCohort = cohorts
        .map((cohort) => {
          const materialised = byId.get(cohort.cohortId);
          const shares = cohortSharesOf(position, materialised?.shares ?? 0n, refs, cohort.cohortId);
          const claimable = pendingRewardOf(position, materialised, refs, cohort, campaign.globalAccRay);
          return { cohortId: cohort.cohortId, shares, claimable };
        })
        .filter((c) => c.shares > 0n || c.claimable > 0n);

      const refundable = refundableOf(position, refs, campaign.currentCohort, campaign.poolTotal);
      const totalClaimable = position.accruedReward + perCohort.reduce((s, c) => s + c.claimable, 0n);

      if (refundable === 0n && totalClaimable === 0n && perCohort.length === 0) continue;

      out.push({
        campaign,
        metadata: await this.metadataOf(address),
        refundable,
        accrued: position.accruedReward,
        cohorts: perCohort,
        totalClaimable,
      });
    }
    return out;
  }

  private async metadataOf(address: Address): Promise<CampaignMetadata> {
    const stored = await this.metadata.get(address);
    if (stored) return stored;
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    return { campaign: address, name: `Campaign ${short}`, description: "", updatedAt: new Date(0) };
  }
}
