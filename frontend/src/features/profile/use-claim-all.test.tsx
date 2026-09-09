import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ToastProvider } from "@/shared/ui";
import type { AccountPosition } from "@/lib/api/client";
import { useClaimAll } from "./use-claim-all";

/**
 * "Claim all" is a sequence of independent transactions, one per campaign, and
 * the interesting behaviour is all in what happens between them: a rejection
 * halfway through must keep what was already claimed, and the amounts already
 * collected must stop being offered while the indexer catches up — roughly
 * fifteen seconds during which the API still reports them as claimable.
 */
const { writeContractAsync, waitForTransactionReceipt } = vi.hoisted(() => ({
  writeContractAsync: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useWriteContract: () => ({ writeContractAsync }),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

const AURORA = "0xce9ce282137528c916a15ad5542403bff51845ca" as const;
const MERIDIAN = "0x011fca24bfc4aff93cb35b8bd2a74f3b3110eeba" as const;

function position(overrides: Partial<AccountPosition> & { campaignAddress: `0x${string}` }): AccountPosition {
  return {
    campaignName: "Aurora Compute",
    status: "returning",
    refundable: 0,
    accrued: 0,
    totalClaimable: 100,
    cohorts: [{ index: 1, shares: 1000, claimable: 100 }],
    ...overrides,
  };
}

function renderClaimAll(positions: AccountPosition[]) {
  return renderHook((props: AccountPosition[]) => useClaimAll(props), {
    initialProps: positions,
    wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  writeContractAsync.mockResolvedValue("0xtx");
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("useClaimAll targets", () => {
  it("counts one signature per campaign with something to claim", () => {
    const { result } = renderClaimAll([
      position({ campaignAddress: AURORA, totalClaimable: 100 }),
      position({ campaignAddress: MERIDIAN, totalClaimable: 50 }),
    ]);

    expect(result.current.txCount).toBe(2);
  });

  it("ignores positions with nothing claimable", () => {
    const { result } = renderClaimAll([
      position({ campaignAddress: AURORA, totalClaimable: 0, cohorts: [] }),
      position({ campaignAddress: MERIDIAN, totalClaimable: 50 }),
    ]);

    expect(result.current.txCount).toBe(1);
  });

  it("does nothing when there is nothing to claim", async () => {
    const { result } = renderClaimAll([
      position({ campaignAddress: AURORA, totalClaimable: 0, cohorts: [] }),
    ]);

    await act(() => result.current.claimAll());

    expect(writeContractAsync).not.toHaveBeenCalled();
  });
});

describe("useClaimAll transactions", () => {
  it("claims each campaign in turn and waits for every receipt", async () => {
    const { result } = renderClaimAll([
      position({ campaignAddress: AURORA }),
      position({ campaignAddress: MERIDIAN }),
    ]);

    await act(() => result.current.claimAll());

    expect(writeContractAsync).toHaveBeenCalledTimes(2);
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  // The contract is told which cohorts to sweep. Passing a cohort with nothing
  // pending wastes gas on a no-op branch.
  it("passes only the cohorts that have rewards pending", async () => {
    const { result } = renderClaimAll([
      position({
        campaignAddress: AURORA,
        cohorts: [
          { index: 1, shares: 1000, claimable: 100 },
          { index: 2, shares: 500, claimable: 0 },
          { index: 3, shares: 250, claimable: 25 },
        ],
      }),
    ]);

    await act(() => result.current.claimAll());

    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "claim", args: [[1n, 3n]] })
    );
  });

  /**
   * An account can hold realised-but-unclaimed rewards outside any cohort with
   * a pending balance. The contract accepts an empty cohort list and still pays
   * that bucket out, so an empty list is a valid claim rather than a skip.
   */
  it("still claims when no individual cohort has a pending balance", async () => {
    const { result } = renderClaimAll([
      position({
        campaignAddress: AURORA,
        totalClaimable: 40,
        cohorts: [{ index: 1, shares: 1000, claimable: 0 }],
      }),
    ]);

    await act(() => result.current.claimAll());

    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ args: [[]] })
    );
  });
});

describe("useClaimAll indexer masking", () => {
  /**
   * The API lags the chain by roughly one indexing cycle, so a refetch right
   * after a claim still reports the amount as claimable. Without the local mask
   * the UI would invite the user to claim the same rewards again — and the
   * second transaction would revert.
   */
  it("stops offering an amount that was just claimed", async () => {
    const { result } = renderClaimAll([position({ campaignAddress: AURORA, totalClaimable: 100 })]);

    await act(() => result.current.claimAll());

    expect(result.current.positions[0].totalClaimable).toBe(0);
    expect(result.current.txCount).toBe(0);
  });

  it("releases the mask once the backend reports the lower figure", async () => {
    const { result, rerender } = renderClaimAll([
      position({ campaignAddress: AURORA, totalClaimable: 100 }),
    ]);

    await act(() => result.current.claimAll());
    expect(result.current.positions[0].totalClaimable).toBe(0);

    // The indexer catches up and new rewards have accrued since.
    rerender([position({ campaignAddress: AURORA, totalClaimable: 30 })]);

    await waitFor(() => expect(result.current.positions[0].totalClaimable).toBe(30));
  });

  it("keeps masking while the backend still reports the stale figure", async () => {
    const { result, rerender } = renderClaimAll([
      position({ campaignAddress: AURORA, totalClaimable: 100 }),
    ]);

    await act(() => result.current.claimAll());
    rerender([position({ campaignAddress: AURORA, totalClaimable: 100 })]);

    expect(result.current.positions[0].totalClaimable).toBe(0);
  });

  it("masks each campaign independently", async () => {
    writeContractAsync.mockResolvedValueOnce("0xtx1").mockRejectedValueOnce(new Error("rejected"));
    const { result } = renderClaimAll([
      position({ campaignAddress: AURORA, totalClaimable: 100 }),
      position({ campaignAddress: MERIDIAN, totalClaimable: 50 }),
    ]);

    await act(() => result.current.claimAll());

    expect(result.current.positions[0].totalClaimable).toBe(0);
    expect(result.current.positions[1].totalClaimable).toBe(50);
  });
});

describe("useClaimAll failure reporting", () => {
  /**
   * A rejection on the third of five campaigns leaves two claims settled on
   * chain. Reporting a flat "Claim failed" would tell the user to retry
   * everything, and the count is the only way they can tell what landed.
   */
  it("names how many claims landed before the rejection", async () => {
    writeContractAsync
      .mockResolvedValueOnce("0xtx1")
      .mockRejectedValueOnce(new Error("User rejected the request"));
    const { result } = renderClaimAll([
      position({ campaignAddress: AURORA }),
      position({ campaignAddress: MERIDIAN }),
    ]);

    await act(() => result.current.claimAll());

    await waitFor(() => expect(screen.getByText("Claim stopped after 1 of 2")).toBeInTheDocument());
  });

  it("reports a plain failure when nothing landed", async () => {
    writeContractAsync.mockRejectedValue(new Error("User rejected the request"));
    const { result } = renderClaimAll([position({ campaignAddress: AURORA })]);

    await act(() => result.current.claimAll());

    await waitFor(() => expect(screen.getByText("Claim failed")).toBeInTheDocument());
  });

  it("leaves the hook idle again after a failure", async () => {
    writeContractAsync.mockRejectedValue(new Error("User rejected the request"));
    const { result } = renderClaimAll([position({ campaignAddress: AURORA })]);

    await act(() => result.current.claimAll());

    expect(result.current.claiming).toBe(false);
    expect(result.current.progress).toBeNull();
  });
});
