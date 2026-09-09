import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { maxUint256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/ui";
import type { Campaign, Cohort } from "@/entities/campaign";
import type { WalletView } from "@/shared/lib/mock-wallet";
import { AngelConsole } from "./angel-console";

/**
 * The two actions here move other people's money: deploying converts believers'
 * refundable deposits into non-refundable cohort shares, and returning pays
 * profit back out. Both are irreversible on chain, so the tests cover who may
 * trigger them, what bound applies, and which contract call each one becomes.
 */
const { withdraw, returnFunds, returnFundsToAll, approve, waitForTransactionReceipt } = vi.hoisted(
  () => ({
    withdraw: vi.fn(),
    returnFunds: vi.fn(),
    returnFundsToAll: vi.fn(),
    approve: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
  })
);

let allowance = 0n;
let wallet: WalletView;

vi.mock("@/shared/lib/mock-wallet", () => ({ useWallet: () => wallet }));

vi.mock("@/lib/hooks/campaign", () => ({
  useCampaignActions: () => ({ withdraw, returnFunds, returnFundsToAll }),
  useTokenActions: () => ({ approve }),
  useToken: () => ({ allowance }),
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

const ADDRESS = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;
const ANGEL = "0x9999999999999999999999999999999999999999" as const;

const campaign: Campaign = {
  address: ADDRESS,
  name: "Aurora Compute",
  description: "",
  angel: { address: ANGEL },
  status: "returning",
  poolBalance: 1000,
  totalDeposited: 1400,
  totalWithdrawn: 400,
  totalReturned: 60,
  cohortCount: 2,
  believers: 12,
  createdAt: "2026-03-12T10:00:00.000Z",
};

const cohorts: Cohort[] = [
  {
    campaignAddress: ADDRESS,
    index: 1,
    formedAt: "2026-04-01T10:00:00.000Z",
    totalShares: 250,
    returned: 50,
    yourShares: 0,
    yourClaimable: 0,
  },
  {
    campaignAddress: ADDRESS,
    index: 2,
    formedAt: "2026-05-01T10:00:00.000Z",
    totalShares: 150,
    returned: 10,
    yourShares: 0,
    yourClaimable: 0,
  },
];

function renderConsole(props: Partial<React.ComponentProps<typeof AngelConsole>> = {}) {
  return render(
    <ToastProvider>
      <AngelConsole address={ADDRESS} campaign={campaign} cohorts={cohorts} isAngel {...props} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  allowance = maxUint256;
  wallet = {
    status: "connected",
    address: ANGEL,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
  };
  withdraw.mockResolvedValue("0xdeploy");
  returnFunds.mockResolvedValue("0xreturn");
  returnFundsToAll.mockResolvedValue("0xreturnall");
  approve.mockResolvedValue("0xapprove");
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("AngelConsole permissions", () => {
  /**
   * The contract rejects a non-angel caller, so nothing can actually be stolen
   * here — but an enabled button that always reverts costs gas and reads as a
   * bug. The gate belongs in front of the wallet prompt.
   */
  it("disables both actions for anyone who is not the angel", async () => {
    const user = userEvent.setup();
    renderConsole({ isAngel: false });

    await user.type(screen.getByLabelText("Amount to deploy"), "100");
    await user.type(screen.getByLabelText("Amount to return"), "50");

    expect(screen.getByRole("button", { name: /Review deployment/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Return funds" })).toBeDisabled();
  });

  it("explains who may act when the viewer is not the angel", () => {
    renderConsole({ isAngel: false });

    expect(screen.getByText(/Only the campaign angel can deploy capital/)).toBeInTheDocument();
  });

  it("warns the angel that the actions are irreversible", () => {
    renderConsole();

    expect(screen.getByText(/permanently recorded onchain/)).toBeInTheDocument();
  });
});

describe("AngelConsole deploying capital", () => {
  // Deploying more than the pool holds reverts on chain; the pool balance is
  // the only bound that exists, and it is known client-side.
  it("refuses to deploy more than the pool holds", async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.type(screen.getByLabelText("Amount to deploy"), "1500");

    expect(screen.getByRole("alert")).toHaveTextContent(/Pool holds 1.000\.00/);
    expect(screen.getByRole("button", { name: /Review deployment/ })).toBeDisabled();
  });

  it("names the cohort that deploying will mint", async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.type(screen.getByLabelText("Amount to deploy"), "400");
    await user.click(screen.getByRole("button", { name: /Review deployment/ }));

    // Two cohorts exist, so the next one is #3.
    expect(await screen.findByRole("dialog")).toHaveTextContent("Mint Cohort #3");
  });

  it("withdraws the amount in base units once confirmed", async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.type(screen.getByLabelText("Amount to deploy"), "400.5");
    await user.click(screen.getByRole("button", { name: /Review deployment/ }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /^Deploy 400\.5/ }));

    await waitFor(() => expect(withdraw).toHaveBeenCalledWith(400_500_000n));
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xdeploy" });
  });

  it("signs nothing while the deployment is only being reviewed", async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.type(screen.getByLabelText("Amount to deploy"), "400");
    await user.click(screen.getByRole("button", { name: /Review deployment/ }));
    await screen.findByRole("dialog");

    expect(withdraw).not.toHaveBeenCalled();
  });
});

describe("AngelConsole returning funds", () => {
  /**
   * The two distribution modes are different contract functions, and picking
   * the wrong one pays the wrong people: returnFundsToAll spreads across every
   * cohort pro-rata, returnFunds credits exactly one.
   */
  it("spreads a return across all cohorts by default", async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.type(screen.getByLabelText("Amount to return"), "60");
    await user.click(screen.getByRole("button", { name: "Return funds" }));

    await waitFor(() => expect(returnFundsToAll).toHaveBeenCalledWith(60_000_000n));
    expect(returnFunds).not.toHaveBeenCalled();
  });

  it("credits a single cohort when one is selected", async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.type(screen.getByLabelText("Amount to return"), "25");
    await user.selectOptions(screen.getByLabelText("Distribute to"), "2");
    await user.click(screen.getByRole("button", { name: "Return funds" }));

    await waitFor(() => expect(returnFunds).toHaveBeenCalledWith(25_000_000n, 2n));
    expect(returnFundsToAll).not.toHaveBeenCalled();
  });

  // returnFunds pulls the tokens from the angel's own wallet, so the campaign
  // needs an allowance exactly as a believer's deposit does.
  it("approves the campaign before returning when the allowance is short", async () => {
    allowance = 0n;
    const user = userEvent.setup();
    renderConsole();

    await user.type(screen.getByLabelText("Amount to return"), "60");
    await user.click(screen.getByRole("button", { name: "Return funds" }));

    await waitFor(() => expect(returnFundsToAll).toHaveBeenCalled());
    expect(approve).toHaveBeenCalledWith(ADDRESS, maxUint256);
    expect(approve.mock.invocationCallOrder[0]).toBeLessThan(
      returnFundsToAll.mock.invocationCallOrder[0]
    );
  });

  it("clears the amount after a confirmed return", async () => {
    const user = userEvent.setup();
    renderConsole();

    await user.type(screen.getByLabelText("Amount to return"), "60");
    await user.click(screen.getByRole("button", { name: "Return funds" }));

    await waitFor(() => expect(screen.getByLabelText("Amount to return")).toHaveValue(""));
  });

  it("keeps the amount when the return is rejected", async () => {
    returnFundsToAll.mockRejectedValue(new Error("User rejected the request"));
    const user = userEvent.setup();
    renderConsole();

    await user.type(screen.getByLabelText("Amount to return"), "60");
    await user.click(screen.getByRole("button", { name: "Return funds" }));

    expect(await screen.findByText("Return failed")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount to return")).toHaveValue("60");
  });
});

describe("AngelConsole cohort ledger", () => {
  it("shows the return multiple per cohort", () => {
    renderConsole();

    // Cohort 1: 50 returned on 250 shares.
    expect(screen.getByText("0.20×")).toBeInTheDocument();
    // Cohort 2: 10 returned on 150 shares.
    expect(screen.getByText("0.07×")).toBeInTheDocument();
  });

  // A cohort is minted with a share supply, but a read that has not resolved
  // leaves it at zero — and the multiple would be a division by it.
  it("renders a dash rather than a multiple for a cohort with no supply", () => {
    renderConsole({
      cohorts: [{ ...cohorts[0], totalShares: 0, returned: 0 }],
    });

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("NaN×")).not.toBeInTheDocument();
    expect(screen.queryByText("Infinity×")).not.toBeInTheDocument();
  });

  /**
   * Cohorts built from chain reads alone carry no formation date. The ledger is
   * a financial table, so an honest dash beats the literal "Invalid Date".
   */
  it("renders a dash for a cohort with no known formation date", () => {
    renderConsole({ cohorts: [{ ...cohorts[0], formedAt: "" }] });

    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
  });
});
