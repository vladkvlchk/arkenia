import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAllCampaigns, useCampaignView, useCohortsView } from "./campaign-data";

/**
 * This module is the seam between the contract's integer accounting and the
 * numbers a person reads. Two things can go wrong here and neither is visible
 * in the UI: the flat multicall results can be sliced at the wrong offset, so a
 * campaign shows another campaign's figures, and the RAY arithmetic can drift
 * from the contract's, so returns are simply wrong.
 */
const { useReadContracts, useCampaigns, useCampaignSummary, useApiCampaigns, useApiCampaignMetadata } =
  vi.hoisted(() => ({
    useReadContracts: vi.fn(),
    useCampaigns: vi.fn(),
    useCampaignSummary: vi.fn(),
    useApiCampaigns: vi.fn(),
    useApiCampaignMetadata: vi.fn(),
  }));

let apiEnabled = false;

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useReadContracts,
}));

vi.mock("./campaign", () => ({ useCampaigns, useCampaignSummary }));
vi.mock("./api", () => ({ useApiCampaigns, useApiCampaignMetadata }));

// API_ENABLED is a module constant, so it is exposed through a getter the tests
// can flip between the indexer-backed and on-chain-fallback paths.
vi.mock("@/shared/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/config")>()),
  get API_ENABLED() {
    return apiEnabled;
  },
}));

const AURORA = "0xce9ce282137528c916a15ad5542403bff51845ca" as const;
const UNKNOWN = "0x1234567890abcdef1234567890abcdef12345678" as const;
const ANGEL = "0x9999999999999999999999999999999999999999" as const;
const RAY = 10n ** 27n;

/** wagmi returns one entry per call in a flat array — `{ result }` per contract read. */
const results = (...values: unknown[]) => ({ data: values.map((result) => ({ result })) });

beforeEach(() => {
  vi.clearAllMocks();
  apiEnabled = false;
  useCampaigns.mockReturnValue({ campaigns: [], isLoading: false });
  useCampaignSummary.mockReturnValue({ summary: undefined, isLoading: false });
  useApiCampaigns.mockReturnValue({ data: undefined, isError: false });
  useApiCampaignMetadata.mockReturnValue({ data: undefined });
  useReadContracts.mockReturnValue({ data: undefined, isLoading: false });
});

describe("useAllCampaigns on-chain fallback", () => {
  /**
   * Five reads per campaign land in one flat array. If the stride or the base
   * offset is wrong, every campaign after the first renders another campaign's
   * pool — a plausible-looking screen that is entirely false.
   */
  it("slices each campaign's reads out of the flat multicall result", () => {
    useCampaigns.mockReturnValue({ campaigns: [AURORA, UNKNOWN], isLoading: false });
    useReadContracts.mockReturnValue({
      isLoading: false,
      ...results(
        ANGEL, 1_000_000_000n, 0n, 0n, 0n,          // Aurora: 1 000 in pool, no cohorts
        ANGEL, 500_000_000n, 2n, 250_000_000n, 40_000_000n // Unknown: 500 pool, 2 cohorts
      ),
    });

    const { result } = renderHook(() => useAllCampaigns());

    expect(result.current.campaigns).toHaveLength(2);
    expect(result.current.campaigns[0]).toMatchObject({
      address: AURORA,
      poolBalance: 1000,
      totalWithdrawn: 0,
      cohortCount: 0,
      status: "open",
    });
    expect(result.current.campaigns[1]).toMatchObject({
      address: UNKNOWN,
      poolBalance: 500,
      totalWithdrawn: 250,
      totalReturned: 40,
      cohortCount: 2,
      status: "returning",
    });
  });

  // Lifetime deposits are not stored on chain; they are the refundable pool plus
  // everything the angel has already deployed.
  it("derives lifetime deposits from pool plus deployed capital", () => {
    useCampaigns.mockReturnValue({ campaigns: [AURORA], isLoading: false });
    useReadContracts.mockReturnValue({
      isLoading: false,
      ...results(ANGEL, 600_000_000n, 1n, 400_000_000n, 0n),
    });

    const { result } = renderHook(() => useAllCampaigns());

    expect(result.current.campaigns[0].totalDeposited).toBe(1000);
  });

  /**
   * A single failed read in a multicall arrives as an entry with no result. The
   * campaign is dropped rather than rendered with a zero angel and zeroed
   * figures, which would read as a real but empty campaign.
   */
  it("drops a campaign whose reads did not resolve", () => {
    useCampaigns.mockReturnValue({ campaigns: [AURORA, UNKNOWN], isLoading: false });
    useReadContracts.mockReturnValue({
      isLoading: false,
      ...results(
        undefined, undefined, undefined, undefined, undefined,
        ANGEL, 500_000_000n, 0n, 0n, 0n
      ),
    });

    const { result } = renderHook(() => useAllCampaigns());

    expect(result.current.campaigns).toHaveLength(1);
    expect(result.current.campaigns[0].address).toBe(UNKNOWN);
  });
});

describe("useAllCampaigns source selection", () => {
  it("prefers the indexer when it has answered", () => {
    apiEnabled = true;
    useApiCampaigns.mockReturnValue({
      data: [{ address: UNKNOWN, name: "From indexer", believers: 12 }],
      isError: false,
    });

    const { result } = renderHook(() => useAllCampaigns());

    expect(result.current.campaigns[0]).toMatchObject({ name: "From indexer", believers: 12 });
    expect(result.current.isLoading).toBe(false);
  });

  // The on-chain path has no believer count and no creation time, so an empty
  // or failing indexer must not leave the page blank.
  it("falls back to chain reads when the indexer errors", () => {
    apiEnabled = true;
    useApiCampaigns.mockReturnValue({ data: undefined, isError: true });
    useCampaigns.mockReturnValue({ campaigns: [AURORA], isLoading: false });
    useReadContracts.mockReturnValue({
      isLoading: false,
      ...results(ANGEL, 1_000_000_000n, 0n, 0n, 0n),
    });

    const { result } = renderHook(() => useAllCampaigns());

    expect(result.current.campaigns[0].poolBalance).toBe(1000);
  });

  it("falls back when the indexer answers with an empty list", () => {
    apiEnabled = true;
    useApiCampaigns.mockReturnValue({ data: [], isError: false });
    useCampaigns.mockReturnValue({ campaigns: [AURORA], isLoading: false });
    useReadContracts.mockReturnValue({
      isLoading: false,
      ...results(ANGEL, 1_000_000_000n, 0n, 0n, 0n),
    });

    const { result } = renderHook(() => useAllCampaigns());

    expect(result.current.campaigns).toHaveLength(1);
  });

  // The four seeded demo campaigns keep their hardcoded names until the backend
  // holds a real record for them.
  it("overrides an indexer name for a seeded campaign", () => {
    apiEnabled = true;
    useApiCampaigns.mockReturnValue({
      data: [{ address: AURORA, name: "Stale indexer name", description: "stale" }],
      isError: false,
    });

    const { result } = renderHook(() => useAllCampaigns());

    expect(result.current.campaigns[0].name).toBe("Aurora Compute");
  });
});

describe("useCampaignView metadata precedence", () => {
  const summary = {
    angel: ANGEL,
    token: ANGEL,
    poolTotal: 1_000_000_000n,
    currentCohort: 0n,
    totalShares: 0n,
    rewardReserves: 0n,
  };

  it("keeps the seeded name over a stored record", () => {
    useCampaignSummary.mockReturnValue({ summary, isLoading: false });
    useApiCampaignMetadata.mockReturnValue({
      data: { name: "Renamed", description: "d", updatedAt: "2026-09-08T00:00:00.000Z" },
    });

    const { result } = renderHook(() => useCampaignView(AURORA));

    expect(result.current.campaign?.name).toBe("Aurora Compute");
  });

  it("uses a stored record for a campaign that was never seeded", () => {
    useCampaignSummary.mockReturnValue({ summary, isLoading: false });
    useApiCampaignMetadata.mockReturnValue({
      data: { name: "Stored name", description: "d", updatedAt: "2026-09-08T00:00:00.000Z" },
    });

    const { result } = renderHook(() => useCampaignView(UNKNOWN));

    expect(result.current.campaign?.name).toBe("Stored name");
  });

  /**
   * The backend returns the epoch as updatedAt when it has no stored record and
   * is echoing a derived name back. Taking that as authoritative would replace
   * the locally derived name with an identical one — harmless — but also pin a
   * placeholder cover, so the sentinel is checked rather than the payload.
   */
  it("ignores a record the backend only derived", () => {
    useCampaignSummary.mockReturnValue({ summary, isLoading: false });
    useApiCampaignMetadata.mockReturnValue({
      data: { name: "Derived", description: "", updatedAt: "1970-01-01T00:00:00.000Z" },
    });

    const { result } = renderHook(() => useCampaignView(UNKNOWN));

    expect(result.current.campaign?.name).toBe("Campaign 0x1234…5678");
  });

  it("returns nothing until the summary resolves", () => {
    useCampaignSummary.mockReturnValue({ summary: undefined, isLoading: true });

    const { result } = renderHook(() => useCampaignView(AURORA));

    expect(result.current.campaign).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });
});

describe("useCohortsView", () => {
  /**
   * returned = totalShares × (cohortAcc + globalAcc) / RAY, mirroring the
   * contract's accumulator accounting. The global accumulator covers returns
   * paid to every cohort at once; the per-cohort one covers targeted returns.
   * Dropping either term understates what a cohort has been paid.
   */
  it("computes returns from both accumulators", () => {
    // 1 000 shares, 0.1 USDC per share globally and 0.05 targeted → 150 returned.
    useReadContracts.mockReturnValue({
      isLoading: false,
      ...results(
        RAY / 10n,               // globalAccRay = 0.1
        1_000_000_000n,          // totalCohortShares = 1 000
        RAY / 20n,               // cohortAccRay = 0.05
        250_000_000n,            // your shares = 250
        30_000_000n              // your claimable = 30
      ),
    });

    const { result } = renderHook(() => useCohortsView(AURORA, ANGEL, 1n));

    expect(result.current.cohorts).toHaveLength(1);
    expect(result.current.cohorts[0]).toMatchObject({
      index: 1,
      totalShares: 1000,
      returned: 150,
      yourShares: 250,
      yourClaimable: 30,
    });
  });

  // Four reads per cohort follow a single leading global read; an off-by-one in
  // that base offset would attribute cohort 2's supply to cohort 1.
  it("keeps each cohort's reads with its own index", () => {
    useReadContracts.mockReturnValue({
      isLoading: false,
      ...results(
        0n,
        1_000_000_000n, 0n, 0n, 0n,   // cohort 1
        2_000_000_000n, 0n, 0n, 0n    // cohort 2
      ),
    });

    const { result } = renderHook(() => useCohortsView(AURORA, ANGEL, 2n));

    expect(result.current.cohorts.map((c) => [c.index, c.totalShares])).toEqual([
      [1, 1000],
      [2, 2000],
    ]);
  });

  it("returns no cohorts before the angel has deployed anything", () => {
    const { result } = renderHook(() => useCohortsView(AURORA, ANGEL, 0n));

    expect(result.current.cohorts).toEqual([]);
  });

  it("reports zeroes for a viewer holding no shares", () => {
    useReadContracts.mockReturnValue({
      isLoading: false,
      ...results(0n, 1_000_000_000n, 0n, 0n, 0n),
    });

    const { result } = renderHook(() => useCohortsView(AURORA, undefined, 1n));

    expect(result.current.cohorts[0]).toMatchObject({ yourShares: 0, yourClaimable: 0 });
  });
});
