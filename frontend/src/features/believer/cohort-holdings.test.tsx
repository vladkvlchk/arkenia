import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/ui";
import type { Cohort } from "@/entities/campaign";
import { CohortHoldings } from "./cohort-holdings";

/**
 * The ledger lists every cohort, including ones the viewer never joined, so
 * membership has to be legible per row: a claim control on a cohort the viewer
 * holds nothing in would prompt a wallet signature for a transaction that
 * cannot pay out.
 */
const { claim, waitForTransactionReceipt } = vi.hoisted(() => ({
  claim: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

vi.mock("@/lib/hooks/campaign", () => ({ useCampaignActions: () => ({ claim }) }));
vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

const ADDRESS = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;

function cohort(overrides: Partial<Cohort> & { index: number }): Cohort {
  return {
    campaignAddress: ADDRESS,
    formedAt: "2026-04-01T10:00:00.000Z",
    totalShares: 1000,
    returned: 200,
    yourShares: 250,
    yourClaimable: 50,
    ...overrides,
  };
}

function renderHoldings(cohorts: Cohort[]) {
  return render(
    <ToastProvider>
      <CohortHoldings address={ADDRESS} cohorts={cohorts} />
    </ToastProvider>
  );
}

function rowFor(index: number) {
  return screen.getByText(`#${index}`).closest("tr") as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  claim.mockResolvedValue("0xclaim");
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("CohortHoldings listing", () => {
  it("explains that no cohorts exist yet", () => {
    renderHoldings([]);

    expect(screen.getByText("No cohorts formed yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  // The share of a cohort is what determines the share of its returns, so it
  // is shown alongside the holding rather than left to be worked out.
  it("shows the viewer's stake as a percentage of the cohort", () => {
    renderHoldings([cohort({ index: 1, yourShares: 250, totalShares: 1000 })]);

    expect(within(rowFor(1)).getByText("· 25.00%")).toBeInTheDocument();
  });

  it("marks a cohort the viewer never joined with a dash", () => {
    renderHoldings([cohort({ index: 2, yourShares: 0, yourClaimable: 0 })]);

    const row = rowFor(2);
    expect(within(row).getAllByText("—")).not.toHaveLength(0);
    expect(within(row).queryByRole("button", { name: "Claim" })).not.toBeInTheDocument();
  });

  it("lists cohorts the viewer is not in alongside the ones they are", () => {
    renderHoldings([
      cohort({ index: 1, yourShares: 250 }),
      cohort({ index: 2, yourShares: 0, yourClaimable: 0 }),
    ]);

    expect(screen.getAllByRole("row")).toHaveLength(3); // header + two cohorts
  });
});

describe("CohortHoldings claiming", () => {
  it("offers no claim on a cohort with nothing pending", () => {
    renderHoldings([cohort({ index: 1, yourShares: 250, yourClaimable: 0 })]);

    expect(within(rowFor(1)).getByRole("button", { name: "Claim" })).toBeDisabled();
  });

  /**
   * Each row claims its own cohort. Sending the whole list, or the wrong index,
   * would either overpay the transaction's scope or claim from a cohort the
   * viewer did not ask about.
   */
  it("claims only the cohort whose row was used", async () => {
    const user = userEvent.setup();
    renderHoldings([
      cohort({ index: 1, yourClaimable: 50 }),
      cohort({ index: 2, yourClaimable: 30 }),
    ]);

    await user.click(within(rowFor(2)).getByRole("button", { name: "Claim" }));

    await waitFor(() => expect(claim).toHaveBeenCalledWith([2n]));
  });

  it("waits for the receipt before confirming", async () => {
    const user = userEvent.setup();
    renderHoldings([cohort({ index: 1 })]);

    await user.click(within(rowFor(1)).getByRole("button", { name: "Claim" }));

    expect(await screen.findByText("Claimed from Cohort #1")).toBeInTheDocument();
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xclaim" });
  });

  it("reports a rejected claim", async () => {
    claim.mockRejectedValue(new Error("User rejected the request"));
    const user = userEvent.setup();
    renderHoldings([cohort({ index: 1 })]);

    await user.click(within(rowFor(1)).getByRole("button", { name: "Claim" }));

    expect(await screen.findByText("Claim failed")).toBeInTheDocument();
  });

  // Cohorts built from chain reads alone carry no formation date.
  it("renders a dash rather than an invalid date", () => {
    renderHoldings([cohort({ index: 1, formedAt: "" })]);

    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });
});
