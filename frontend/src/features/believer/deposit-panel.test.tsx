import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { maxUint256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/ui";
import type { WalletView, WalletStatus } from "@/shared/lib/mock-wallet";
import { DepositPanel } from "./deposit-panel";

/**
 * A flow test rather than a component test: the value is in the sequence a
 * deposit actually takes — validate, review, approve if needed, deposit, wait
 * for the receipt — and in the arguments handed to the chain, which no amount
 * of rendering assertions would catch.
 *
 * The chain layer is mocked at the hook boundary the feature already depends
 * on. The toast provider is real: the confirmation is part of the flow, and a
 * stub would only prove the stub was called.
 */
const CAMPAIGN = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;
const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;
const TX_HASH = "0xabc123" as const;

const deposit = vi.fn();
const approve = vi.fn();
const waitForTransactionReceipt = vi.fn();
let allowance = 0n;
let wallet: WalletView;

vi.mock("@/shared/lib/mock-wallet", () => ({
  useWallet: () => wallet,
}));

vi.mock("@/lib/hooks/campaign", () => ({
  useCampaignActions: () => ({ deposit }),
  useTokenActions: () => ({ approve }),
  useToken: () => ({ allowance }),
}));

// Partial mock: the shared UI barrel pulls in the wagmi config, which needs the
// real `http` transport. Replacing the whole module would break that import
// long before any assertion runs.
vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

function connectedWallet(overrides: Partial<WalletView> = {}): WalletView {
  return {
    status: "connected" as WalletStatus,
    address: WALLET,
    tokenBalance: 1000,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
    ...overrides,
  };
}

function renderPanel() {
  return render(
    <ToastProvider>
      <DepositPanel address={CAMPAIGN} campaignName="Aurora Compute" />
    </ToastProvider>
  );
}

async function enterAmount(user: ReturnType<typeof userEvent.setup>, amount: string) {
  await user.type(screen.getByLabelText("Amount"), amount);
}

beforeEach(() => {
  vi.clearAllMocks();
  allowance = 0n;
  wallet = connectedWallet();
  deposit.mockResolvedValue(TX_HASH);
  approve.mockResolvedValue("0xapprove");
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("DepositPanel gating", () => {
  it("asks for a wallet before showing the amount field", async () => {
    const connect = vi.fn();
    wallet = connectedWallet({ status: "disconnected", connect });
    const user = userEvent.setup();
    renderPanel();

    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("keeps review unavailable until an amount is entered", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Review deposit" })).toBeDisabled();
  });

  // The contract would revert on a transfer larger than the balance, after the
  // user has already paid gas — so the block belongs in front of the signature.
  it("blocks an amount above the balance and says why", async () => {
    const user = userEvent.setup();
    renderPanel();

    await enterAmount(user, "1500");

    expect(screen.getByRole("alert")).toHaveTextContent(/Exceeds your balance of 1.000\.00/);
    expect(screen.getByRole("button", { name: "Review deposit" })).toBeDisabled();
  });

  it("allows spending the balance exactly", async () => {
    const user = userEvent.setup();
    renderPanel();

    await enterAmount(user, "1000");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review deposit" })).toBeEnabled();
  });
});

describe("DepositPanel review step", () => {
  // The dialog exists so that nothing is signed on a single click. If reviewing
  // ever started sending, the confirmation would be theatre.
  it("signs nothing while the review is open", async () => {
    const user = userEvent.setup();
    renderPanel();

    await enterAmount(user, "250");
    await user.click(screen.getByRole("button", { name: "Review deposit" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(deposit).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
  });

  it("shows the campaign and amount being committed to", async () => {
    const user = userEvent.setup();
    renderPanel();

    await enterAmount(user, "250.5");
    await user.click(screen.getByRole("button", { name: "Review deposit" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Aurora Compute");
    expect(dialog).toHaveTextContent("250.50");
  });
});

describe("DepositPanel submission", () => {
  async function reviewAndConfirm(amount: string) {
    const user = userEvent.setup();
    renderPanel();
    await enterAmount(user, amount);
    await user.click(screen.getByRole("button", { name: "Review deposit" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Confirm deposit" }));
    return user;
  }

  /**
   * The amount reaches the contract in base units, and the conversion is the
   * one place a typo costs a factor of a million. 250.5 tUSDC is 250_500_000
   * with six decimals.
   */
  it("sends the amount in token base units", async () => {
    await reviewAndConfirm("250.5");

    await waitFor(() => expect(deposit).toHaveBeenCalledWith(250_500_000n));
  });

  it("approves before depositing when the allowance is short", async () => {
    allowance = 0n;
    await reviewAndConfirm("250");

    await waitFor(() => expect(deposit).toHaveBeenCalled());
    expect(approve).toHaveBeenCalledWith(CAMPAIGN, maxUint256);
    // The approval has to be mined before the deposit can pull the funds.
    expect(approve.mock.invocationCallOrder[0]).toBeLessThan(deposit.mock.invocationCallOrder[0]);
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xapprove" });
  });

  // An unnecessary approval is a second signature and a second gas payment for
  // no change in state.
  it("skips the approval when the allowance already covers the amount", async () => {
    allowance = 1_000_000_000n;
    await reviewAndConfirm("250");

    await waitFor(() => expect(deposit).toHaveBeenCalled());
    expect(approve).not.toHaveBeenCalled();
  });

  it("waits for the deposit receipt before reporting success", async () => {
    await reviewAndConfirm("250");

    await waitFor(() => expect(screen.getByText("Deposit confirmed")).toBeInTheDocument());
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH });
  });

  it("clears the field and closes the review once confirmed", async () => {
    await reviewAndConfirm("250");

    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveValue(""));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("DepositPanel failure handling", () => {
  /**
   * A rejected signature is the most common outcome of all, and the amount must
   * survive it: clearing the field would make the user retype it, and closing
   * the dialog silently would look like the deposit went through.
   */
  it("reports a rejected transaction and keeps the amount", async () => {
    deposit.mockRejectedValue(new Error("User rejected the request"));
    const user = userEvent.setup();
    renderPanel();

    await enterAmount(user, "250");
    await user.click(screen.getByRole("button", { name: "Review deposit" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Confirm deposit" }));

    expect(await screen.findByText("Deposit failed")).toBeInTheDocument();
    expect(screen.getByText("User rejected the request")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue("250");
  });

  it("does not deposit when the approval fails", async () => {
    approve.mockRejectedValue(new Error("User rejected the request"));
    const user = userEvent.setup();
    renderPanel();

    await enterAmount(user, "250");
    await user.click(screen.getByRole("button", { name: "Review deposit" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Confirm deposit" }));

    expect(await screen.findByText("Deposit failed")).toBeInTheDocument();
    expect(deposit).not.toHaveBeenCalled();
  });
});
