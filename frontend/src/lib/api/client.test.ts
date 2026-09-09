import { afterEach, describe, expect, it, vi } from "vitest";
import { API_V3_URL } from "@/shared/config";
import { ApiError, api, buildMetadataMessage } from "./client";

/**
 * The transport is mocked at `fetch` rather than at the module boundary: these
 * tests are about the request this client actually puts on the wire — its URL,
 * its headers and how it turns a failure response into an error — none of which
 * a stubbed `api` object would exercise.
 */
type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({}),
    ...response,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock as FetchMock;
}

function lastRequest(fetchMock: FetchMock) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
  return { url, init };
}

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as const;

afterEach(() => vi.unstubAllGlobals());

describe("request transport", () => {
  it("prefixes every path with the versioned API base", async () => {
    const fetchMock = mockFetch({ json: async () => ({ campaigns: [] }) });

    await api.listCampaigns();

    expect(lastRequest(fetchMock).url).toBe(`${API_V3_URL}/campaigns`);
  });

  it("sends JSON bodies with a JSON content type", async () => {
    const fetchMock = mockFetch({ json: async () => ({ order: {} }) });

    await api.submitOrder(
      ADDRESS,
      {
        maker: ADDRESS,
        isSell: false,
        cohortId: "1",
        shareAmount: "1000000",
        usdcAmount: "1000000",
        nonce: "1",
        deadline: "2",
      },
      "0xsignature" as `0x${string}`
    );

    const { init } = lastRequest(fetchMock);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "content-type": "application/json" });
  });

  /**
   * A multipart body carries its own boundary in the content type, and the
   * browser only fills it in when the header is absent. Setting
   * "application/json" over a FormData body makes the backend reject every
   * cover upload — the failure mode this branch exists to prevent.
   */
  it("leaves the content type unset for multipart bodies", async () => {
    const fetchMock = mockFetch({ json: async () => ({ metadata: {} }) });

    await api.putMetadata(
      ADDRESS,
      {
        name: "Aurora",
        description: "",
        issuedAt: "2026-09-08T00:00:00.000Z",
        signature: "0xsig" as `0x${string}`,
      },
      new Blob(["cover"], { type: "image/png" })
    );

    const { init } = lastRequest(fetchMock);
    expect(init?.body).toBeInstanceOf(FormData);
    expect(init?.headers).not.toHaveProperty("content-type");
  });

  it("uses the JSON path when there is no cover", async () => {
    const fetchMock = mockFetch({ json: async () => ({ metadata: {} }) });

    await api.putMetadata(ADDRESS, {
      name: "Aurora",
      description: "",
      issuedAt: "2026-09-08T00:00:00.000Z",
      signature: "0xsig" as `0x${string}`,
    });

    const { init } = lastRequest(fetchMock);
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBeTypeOf("string");
    expect(init?.headers).toMatchObject({ "content-type": "application/json" });
  });
});

describe("request error handling", () => {
  it("surfaces the backend error code and message", async () => {
    mockFetch({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: async () => ({ error: { code: "order_exists", message: "Order already resting" } }),
    });

    await expect(api.listCampaigns()).rejects.toThrowError(ApiError);
    await expect(api.listCampaigns()).rejects.toMatchObject({
      code: "order_exists",
      message: "Order already resting",
      status: 409,
    });
  });

  // A gateway or proxy failure returns HTML, not the backend's error envelope,
  // and the client still has to produce a usable error rather than crash on the
  // unparseable body.
  it("falls back to the status when the body is not the error envelope", async () => {
    mockFetch({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });

    await expect(api.listCampaigns()).rejects.toMatchObject({
      code: "http_502",
      message: "Bad Gateway",
      status: 502,
    });
  });
});

describe("query parameters", () => {
  it("omits the account filter when no account is connected", async () => {
    const fetchMock = mockFetch({ json: async () => ({ campaign: {}, cohorts: [] }) });

    await api.getCampaign(ADDRESS);
    expect(lastRequest(fetchMock).url).toBe(`${API_V3_URL}/campaigns/${ADDRESS}`);

    await api.getCampaign(ADDRESS, ADDRESS);
    expect(lastRequest(fetchMock).url).toBe(
      `${API_V3_URL}/campaigns/${ADDRESS}?account=${ADDRESS}`
    );
  });

  it("applies the default activity limit and an explicit one", async () => {
    const fetchMock = mockFetch({ json: async () => ({ activity: [] }) });

    await api.campaignActivity(ADDRESS);
    expect(lastRequest(fetchMock).url).toContain("limit=50");

    await api.campaignActivity(ADDRESS, 10);
    expect(lastRequest(fetchMock).url).toContain("limit=10");
  });

  // Cohort indices are 1-based (the premarket page floors them at 1), so the
  // falsy check below never drops a real cohort. Pinned so that a future move
  // to 0-based indices fails here rather than silently querying the whole book.
  it("scopes the order book to a cohort when one is selected", async () => {
    const fetchMock = mockFetch({ json: async () => ({ book: {}, orders: [], trades: [] }) });

    await api.orderBook(ADDRESS);
    expect(lastRequest(fetchMock).url).toBe(`${API_V3_URL}/campaigns/${ADDRESS}/orders`);

    await api.orderBook(ADDRESS, 3);
    expect(lastRequest(fetchMock).url).toBe(`${API_V3_URL}/campaigns/${ADDRESS}/orders?cohort=3`);
  });
});

describe("buildMetadataMessage", () => {
  /**
   * The angel personal-signs this exact string and backend-v3 rebuilds it to
   * recover the address. Any drift — field order, casing, a stray space —
   * recovers a different signer and the write is rejected as unauthorised, so
   * the whole message is pinned literally rather than assembled in the test.
   */
  it("produces the canonical message the backend re-derives", () => {
    const message = buildMetadataMessage(
      84532,
      "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
      "Aurora Compute",
      "Distributed GPU cycles.",
      "2026-09-08T12:00:00.000Z"
    );

    expect(message).toBe(
      [
        "Arkenia campaign metadata",
        "chainId: 84532",
        "campaign: 0xabcdef1234567890abcdef1234567890abcdef12",
        "name: Aurora Compute",
        "description: Distributed GPU cycles.",
        "issuedAt: 2026-09-08T12:00:00.000Z",
      ].join("\n")
    );
  });

  // The address reaches this function in whatever casing the caller had —
  // checksummed from viem, lowercase from the API — and both must sign the same
  // bytes.
  it("normalises the campaign address to lowercase", () => {
    const upper = buildMetadataMessage(1, "0xABCD", "n", "d", "t");
    const lower = buildMetadataMessage(1, "0xabcd", "n", "d", "t");

    expect(upper).toBe(lower);
  });
});
