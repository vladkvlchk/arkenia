/**
 * Typed client for the V3 backend (backend-v3, mounted at /api/v3/*). One generic `request`
 * helper; every endpoint returns the same DTO shapes the presentational entities already use,
 * so wiring changes no displayed value. Failures throw ApiError — the react-query hooks that
 * call these degrade gracefully to on-chain reads.
 */
import { API_V3_URL } from "@/shared/config";
import type { Campaign, Cohort, ActivityItem } from "@/entities/campaign";

type Addr = `0x${string}`;

/** GET /accounts/:address/positions row — profile-only, not a presentational entity. */
export interface AccountPosition {
  campaignAddress: Addr;
  campaignName: string;
  status: "open" | "returning";
  refundable: number;
  accrued: number;
  totalClaimable: number;
  cohorts: { index: number; shares: number; claimable: number }[];
}

/** The signed order struct a taker feeds verbatim to CampaignV3.fillOrder. */
export interface SignedOrderDto {
  maker: Addr;
  isSell: boolean;
  cohortId: string;
  shareAmount: string;
  usdcAmount: string;
  nonce: string;
  deadline: string;
}

export interface ApiOrder {
  id: string;
  campaignAddress: Addr;
  cohortIndex: number;
  side: "bid" | "ask";
  price: number;
  size: number;
  filled: number;
  remaining: number;
  status: string;
  maker: Addr;
  placedAt: string;
  deadline: string;
  fill: { order: SignedOrderDto; signature: Addr };
}

export interface ApiTrade {
  id: string;
  side: "bid" | "ask";
  price: number;
  size: number;
  at: string;
  cohortIndex: number;
  maker: Addr;
  taker: Addr;
  txHash: Addr;
}

export interface ApiOrderBook {
  book: {
    campaignAddress: Addr;
    cohortIndex?: number;
    bids: { price: number; size: number }[];
    asks: { price: number; size: number }[];
    lastPrice?: number;
  };
  orders: ApiOrder[];
  trades: ApiTrade[];
}

export interface CampaignMetadataDto {
  campaignAddress: Addr;
  name: string;
  description: string;
  coverUrl?: string;
  /** ISO-8601; epoch (1970) marks a derived fallback, not a stored record. */
  updatedAt: string;
}

/** Backend `Campaign` carries one extra field beyond the presentational entity. */
export type ApiCampaign = Campaign & { lifetimeDeposited?: number };
/** Activity rows carry their source campaign address. */
export type ApiActivityItem = ActivityItem & { campaignAddress: Addr };

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData carries its own multipart boundary — never force a JSON content-type over it.
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(`${API_V3_URL}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { "content-type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no / non-JSON body */
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error ?? {};
    throw new ApiError(err.code ?? `http_${res.status}`, err.message ?? res.statusText, res.status);
  }
  return body as T;
}

/**
 * The exact string the angel personal-signs to authorize a metadata write. Must match
 * backend-v3 `metadataMessage()` byte-for-byte — name/description are trimmed by both sides.
 */
export function buildMetadataMessage(
  chainId: number,
  campaign: Addr,
  name: string,
  description: string,
  issuedAt: string
): string {
  return [
    "Arkenia campaign metadata",
    `chainId: ${chainId}`,
    `campaign: ${campaign.toLowerCase()}`,
    `name: ${name}`,
    `description: ${description}`,
    `issuedAt: ${issuedAt}`,
  ].join("\n");
}

export const api = {
  listCampaigns: () => request<{ campaigns: ApiCampaign[] }>(`/campaigns`).then((r) => r.campaigns),
  getCampaign: (address: Addr, account?: Addr) =>
    request<{ campaign: ApiCampaign; cohorts: Cohort[] }>(
      `/campaigns/${address}${account ? `?account=${account}` : ""}`
    ),
  campaignActivity: (address: Addr, limit = 50) =>
    request<{ activity: ApiActivityItem[] }>(
      `/campaigns/${address}/activity?limit=${limit}`
    ).then((r) => r.activity),
  accountPositions: (address: Addr) =>
    request<{ positions: AccountPosition[] }>(`/accounts/${address}/positions`).then(
      (r) => r.positions
    ),
  accountActivity: (address: Addr, limit = 50) =>
    request<{ activity: ApiActivityItem[] }>(
      `/accounts/${address}/activity?limit=${limit}`
    ).then((r) => r.activity),
  orderBook: (address: Addr, cohort?: number) =>
    request<ApiOrderBook>(`/campaigns/${address}/orders${cohort ? `?cohort=${cohort}` : ""}`),
  metadata: (address: Addr) =>
    request<{ metadata: CampaignMetadataDto }>(`/campaigns/${address}/metadata`).then(
      (r) => r.metadata
    ),
  submitOrder: (address: Addr, order: SignedOrderDto, signature: Addr) =>
    request<{ order: ApiOrder }>(`/campaigns/${address}/orders`, {
      method: "POST",
      body: JSON.stringify({ order, signature }),
    }).then((r) => r.order),
  putMetadata: (
    address: Addr,
    body: { name: string; description: string; issuedAt: string; signature: Addr },
    cover?: Blob
  ) => {
    // With a cover we must use multipart/form-data — the backend reads the `cover` file part;
    // without one, the lighter JSON path. Field names/casing mirror the backend `putBody` schema.
    let init: RequestInit;
    if (cover) {
      const form = new FormData();
      form.set("name", body.name);
      form.set("description", body.description);
      form.set("issuedAt", body.issuedAt);
      form.set("signature", body.signature);
      form.set("cover", cover);
      init = { method: "PUT", body: form };
    } else {
      init = { method: "PUT", body: JSON.stringify(body) };
    }
    return request<{ metadata: CampaignMetadataDto }>(
      `/campaigns/${address}/metadata`,
      init
    ).then((r) => r.metadata);
  },
};
