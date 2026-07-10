import { and, asc, desc, eq } from "drizzle-orm";
import type { CampaignQueryStore } from "../../../application/ports.js";
import type {
  ActivityEntry,
  Address,
  CampaignState,
  CohortState,
  Hex,
  PositionState,
  ShareState,
} from "../../../domain/types.js";
import type { DbHandle } from "../client.js";
import * as t from "../schema.js";

type ActivityRow = typeof t.activity.$inferSelect;

function rowToActivity(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    campaign: row.campaign as Address,
    type: row.type as ActivityEntry["type"],
    actor: row.actor as Address,
    amount: row.amount,
    ...(row.cohortId !== null ? { cohortId: row.cohortId } : {}),
    txHash: row.txHash as Hex,
    at: row.at,
  };
}

export class DrizzleCampaignQueryStore implements CampaignQueryStore {
  constructor(private readonly db: DbHandle) {}

  async listCampaigns(chainId: number): Promise<CampaignState[]> {
    const rows = await this.db
      .select()
      .from(t.campaigns)
      .where(eq(t.campaigns.chainId, chainId))
      .orderBy(desc(t.campaigns.createdBlock));
    return rows as CampaignState[];
  }

  async getCampaign(address: Address): Promise<CampaignState | null> {
    const rows = await this.db
      .select()
      .from(t.campaigns)
      .where(eq(t.campaigns.address, address.toLowerCase()));
    return (rows[0] as CampaignState | undefined) ?? null;
  }

  async listCohorts(campaign: Address): Promise<CohortState[]> {
    const rows = await this.db
      .select()
      .from(t.cohorts)
      .where(eq(t.cohorts.campaign, campaign.toLowerCase()))
      .orderBy(asc(t.cohorts.cohortId));
    return rows as CohortState[];
  }

  async listActivityForCampaign(campaign: Address, limit: number): Promise<ActivityEntry[]> {
    const rows = await this.db
      .select()
      .from(t.activity)
      .where(eq(t.activity.campaign, campaign.toLowerCase()))
      .orderBy(desc(t.activity.at), desc(t.activity.id))
      .limit(limit);
    return rows.map(rowToActivity);
  }

  async listActivityForAccount(account: Address, limit: number): Promise<ActivityEntry[]> {
    const rows = await this.db
      .select()
      .from(t.activity)
      .where(eq(t.activity.actor, account.toLowerCase()))
      .orderBy(desc(t.activity.at), desc(t.activity.id))
      .limit(limit);
    return rows.map(rowToActivity);
  }

  async listCampaignsForAccount(account: Address): Promise<Address[]> {
    const a = account.toLowerCase();
    const fromPositions = await this.db
      .select({ campaign: t.positions.campaign })
      .from(t.positions)
      .where(eq(t.positions.account, a));
    const fromShares = await this.db
      .select({ campaign: t.shares.campaign })
      .from(t.shares)
      .where(eq(t.shares.account, a));
    return [...new Set([...fromPositions, ...fromShares].map((r) => r.campaign as Address))];
  }

  async getPosition(campaign: Address, account: Address): Promise<PositionState | null> {
    const rows = await this.db
      .select()
      .from(t.positions)
      .where(
        and(eq(t.positions.campaign, campaign.toLowerCase()), eq(t.positions.account, account.toLowerCase()))
      );
    return (rows[0] as PositionState | undefined) ?? null;
  }

  async listSharesForAccount(campaign: Address, account: Address): Promise<ShareState[]> {
    const rows = await this.db
      .select()
      .from(t.shares)
      .where(
        and(eq(t.shares.campaign, campaign.toLowerCase()), eq(t.shares.account, account.toLowerCase()))
      )
      .orderBy(asc(t.shares.cohortId));
    return rows as ShareState[];
  }
}
