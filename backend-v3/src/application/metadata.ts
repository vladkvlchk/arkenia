/**
 * Campaign metadata — the only content that lives off-chain by design
 * (CampaignV3 stores no name/description/cover). Writes are angel-gated:
 * the caller signs a canonical EIP-191 message; we verify the recovered
 * address is the campaign's on-chain angel.
 */

import { DomainError } from "../domain/errors.js";
import type { Address, CampaignMetadata, Hex } from "../domain/types.js";
import type { CampaignQueryStore, FileStore, MetadataStore, PersonalSignVerifier } from "./ports.js";

export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 500;
/** Accepted clock skew for the signed `issuedAt`, in milliseconds. */
export const AUTH_WINDOW_MS = 10 * 60 * 1000;

const COVER_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/**
 * The exact string the angel signs. Binding chainId + campaign prevents replay
 * across networks/campaigns; the monotonic `issuedAt` prevents replay in time.
 */
export function metadataMessage(input: {
  chainId: number;
  campaign: Address;
  name: string;
  description: string;
  issuedAt: string;
}): string {
  return [
    "Arkenia campaign metadata",
    `chainId: ${input.chainId}`,
    `campaign: ${input.campaign.toLowerCase()}`,
    `name: ${input.name}`,
    `description: ${input.description}`,
    `issuedAt: ${input.issuedAt}`,
  ].join("\n");
}

export interface PutMetadataInput {
  campaign: Address;
  name: string;
  description: string;
  issuedAt: string;
  signature: Hex;
  cover?: { bytes: Buffer; contentType: string };
}

export class PutMetadata {
  constructor(
    private readonly campaigns: CampaignQueryStore,
    private readonly metadata: MetadataStore,
    private readonly verifier: PersonalSignVerifier,
    private readonly files: FileStore,
    private readonly chainId: number,
    private readonly maxCoverBytes: number
  ) {}

  async execute(input: PutMetadataInput): Promise<CampaignMetadata> {
    const campaign = await this.campaigns.getCampaign(input.campaign);
    if (!campaign) throw new DomainError("unknown_campaign", `campaign ${input.campaign} is not indexed`);

    const name = input.name.trim();
    const description = input.description.trim();
    if (name.length === 0 || name.length > NAME_MAX) {
      throw new DomainError("invalid_metadata", `name must be 1–${NAME_MAX} characters`);
    }
    if (description.length > DESCRIPTION_MAX) {
      throw new DomainError("invalid_metadata", `description must be at most ${DESCRIPTION_MAX} characters`);
    }

    const issuedAt = new Date(input.issuedAt);
    if (Number.isNaN(issuedAt.getTime())) {
      throw new DomainError("stale_auth", "issuedAt must be an ISO-8601 timestamp");
    }
    const skew = Math.abs(Date.now() - issuedAt.getTime());
    if (skew > AUTH_WINDOW_MS) {
      throw new DomainError("stale_auth", "issuedAt outside the accepted window — sign again");
    }
    const watermark = await this.metadata.getAuthWatermark(input.campaign);
    if (watermark && issuedAt.getTime() <= watermark.getTime()) {
      throw new DomainError("stale_auth", "issuedAt not newer than the last accepted update");
    }

    const message = metadataMessage({
      chainId: this.chainId,
      campaign: input.campaign,
      name,
      description,
      issuedAt: input.issuedAt,
    });
    const signer = await this.verifier.recover(message, input.signature);
    if (!signer || signer.toLowerCase() !== campaign.angel.toLowerCase()) {
      throw new DomainError("not_angel", "signature does not recover to the campaign angel");
    }

    let coverUrl: string | undefined;
    if (input.cover) {
      if (!this.files.enabled) {
        throw new DomainError("storage_unconfigured", "cover storage (R2) is not configured");
      }
      if (!COVER_TYPES.has(input.cover.contentType)) {
        throw new DomainError("unsupported_cover_type", "cover must be png, jpeg or webp");
      }
      if (input.cover.bytes.byteLength > this.maxCoverBytes) {
        throw new DomainError("cover_too_large", `cover exceeds ${this.maxCoverBytes} bytes`);
      }
      coverUrl = await this.files.putCover(input.campaign, input.cover.bytes, input.cover.contentType);
    } else {
      coverUrl = (await this.metadata.get(input.campaign))?.coverUrl;
    }

    const meta: CampaignMetadata = {
      campaign: input.campaign,
      name,
      description,
      ...(coverUrl ? { coverUrl } : {}),
      updatedAt: new Date(),
    };
    await this.metadata.put(meta, issuedAt);
    return meta;
  }
}

/** Read metadata with the same fallback shape the frontend derives client-side. */
export class GetMetadata {
  constructor(private readonly metadata: MetadataStore) {}

  async execute(campaign: Address): Promise<CampaignMetadata> {
    const stored = await this.metadata.get(campaign);
    if (stored) return stored;
    const short = `${campaign.slice(0, 6)}…${campaign.slice(-4)}`;
    return { campaign, name: `Campaign ${short}`, description: "", updatedAt: new Date(0) };
  }
}
