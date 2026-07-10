import { eq } from "drizzle-orm";
import type { MetadataStore } from "../../../application/ports.js";
import type { Address, CampaignMetadata } from "../../../domain/types.js";
import type { DbHandle } from "../client.js";
import * as t from "../schema.js";

export class DrizzleMetadataStore implements MetadataStore {
  constructor(private readonly db: DbHandle) {}

  async get(campaign: Address): Promise<CampaignMetadata | null> {
    const rows = await this.db
      .select()
      .from(t.campaignMetadata)
      .where(eq(t.campaignMetadata.campaign, campaign.toLowerCase()));
    const r = rows[0];
    if (!r) return null;
    return {
      campaign: r.campaign as Address,
      name: r.name,
      description: r.description,
      ...(r.coverUrl ? { coverUrl: r.coverUrl } : {}),
      updatedAt: r.updatedAt,
    };
  }

  async getAuthWatermark(campaign: Address): Promise<Date | null> {
    const rows = await this.db
      .select({ authIssuedAt: t.campaignMetadata.authIssuedAt })
      .from(t.campaignMetadata)
      .where(eq(t.campaignMetadata.campaign, campaign.toLowerCase()));
    return rows[0]?.authIssuedAt ?? null;
  }

  async put(meta: CampaignMetadata, authIssuedAt: Date): Promise<void> {
    const values = {
      campaign: meta.campaign.toLowerCase(),
      name: meta.name,
      description: meta.description,
      coverUrl: meta.coverUrl ?? null,
      updatedAt: meta.updatedAt,
      authIssuedAt,
    };
    await this.db
      .insert(t.campaignMetadata)
      .values(values)
      .onConflictDoUpdate({ target: t.campaignMetadata.campaign, set: values });
  }
}
