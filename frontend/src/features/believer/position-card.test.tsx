import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/ui";
import { PositionCard } from "./position-card";

/**
 * The believer's two balances behave differently: the pool balance is
 * refundable one-for-one at any time, while claimable returns are swept across
 * cohorts in a single call. Both actions are bounded by figures the UI already
 * knows, so the bound belongs in front of the wallet prompt rather than in a
 * revert.
 */
const { refund, claim, waitForTransactionReceipt } = vi.hoisted(() => ({
  refund: vi.fn(),
  claim: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

vi.mock("@/lib/hooks/campaign", () => ({
  useCampaignActions: () => ({ refund, claim }),
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

const ADDRESS = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;

function renderCard(props: Partial<React.ComponentProps<typeof PositionCard>> = {}) {
  return render(
    <ToastProvider>
      <PositionCard
        address={ADDRESS}
        poolBalance={500}
        claimableTotal={42.5}
        claimCohortIds={[1n, 3n]}
        {...props}
      />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  refund.mockResolvedValue("0xrefund");
  claim.mockResolvedValue("0xclaim");
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("PositionCard refunding", () => {
  it("offers no refund when the pool balance is empty", () => {
    renderCard({ poolBalance: 0 });

    expect(screen.getByRole("button", { name: "Refund" })).toBeDisabled();
  });

  it("refuses to refund more than the refundable balance", async () => {
    const user = userEvent.setup();
    renderCard({ poolBalance: 500 });

    await user.click(screen.getByRole("button", { name: "Refund" }));
    await user.type(await screen.findByLabelText("Amount"), "600");

    expect(screen.getByRole("alert")).toHaveTextContent(/Your refundable balance is 500\.00/);
    expect(screen.getByRole("button", { name: "Confirm refund" })).toBeDisabled();
  });

  it("refunds the amount in base units", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Refund" }));
    await user.type(await screen.findByLabelText("Amount"), "125.25");
    await user.click(screen.getByRole("button", { name: "Confirm refund" }));

    await waitFor(() => expect(refund).toHaveBeenCalledWith(125_250_000n));
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xrefund" });
  });

  it("clears and closes the dialog once the refund confirms", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Refund" }));
    await user.type(await screen.findByLabelText("Amount"), "125");
    await user.click(screen.getByRole("button", { name: "Confirm refund" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reports a rejected refund", async () => {
    refund.mockRejectedValue(new Error("User rejected the request"));
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Refund" }));
    await user.type(await screen.findByLabelText("Amount"), "125");
    await user.click(screen.getByRole("button", { name: "Confirm refund" }));

    expect(await screen.findByText("Refund failed")).toBeInTheDocument();
  });
});

describe("PositionCard claiming", () => {
  it("offers no claim when there is nothing to collect", () => {
    renderCard({ claimableTotal: 0 });

    expect(screen.getByRole("button", { name: "Claim all" })).toBeDisabled();
  });

  /**
   * The cohort list is what the contract sweeps. Passing the wrong ids does not
   * fail loudly — it simply pays out less than the button promised.
   */
  it("sweeps exactly the cohorts it was given", async () => {
    const user = userEvent.setup();
    renderCard({ claimCohortIds: [1n, 3n] });

    await user.click(screen.getByRole("button", { name: "Claim all" }));

    await waitFor(() => expect(claim).toHaveBeenCalledWith([1n, 3n]));
  });

  it("waits for the receipt before confirming the claim", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Claim all" }));

    expect(await screen.findByText("Claim confirmed")).toBeInTheDocument();
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xclaim" });
  });

  it("reports a rejected claim", async () => {
    claim.mockRejectedValue(new Error("User rejected the request"));
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Claim all" }));

    expect(await screen.findByText("Claim failed")).toBeInTheDocument();
  });
});
