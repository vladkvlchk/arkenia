import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { maxUint256 } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/ui";
import type { WalletView } from "@/shared/lib/mock-wallet";
import { OrderTicket } from "./order-ticket";

/**
 * An order is an EIP-712 intent: once signed and published, anyone can fill it
 * on-chain at exactly the numbers it carries. There is no confirmation step
 * behind it and no way to unsee a bad signature, so the assertions here are
 * about the struct that gets signed rather than about the form that produced it.
 */
const CAMPAIGN = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;
const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;

/**
 * vi.mock factories are hoisted above every declaration in the file, so a
 * factory that reads a plain const at call time — as the api mock below does
 * for `submitOrder` — throws before a single test runs. vi.hoisted lifts these
 * with it. The `let` bindings further down are safe without it because the
 * factories that read them only do so inside an arrow, long after setup.
 */
const { signOrder, submitOrder, approve, settleTo, waitForTransactionReceipt } = vi.hoisted(() => ({
  signOrder: vi.fn(),
  submitOrder: vi.fn(),
  approve: vi.fn(),
  settleTo: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

let allowance = 0n;
let settledUpTo = 0n;
let wallet: WalletView;

vi.mock("@/shared/lib/mock-wallet", () => ({ useWallet: () => wallet }));

vi.mock("@/lib/hooks/premarket", () => ({ usePremarket: () => ({ signOrder }) }));

vi.mock("@/lib/hooks/campaign", () => ({
  useCampaignActions: () => ({ settleTo }),
  useTokenActions: () => ({ approve }),
  useToken: () => ({ allowance }),
}));

vi.mock("@/lib/api/client", () => ({ api: { submitOrder } }));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  usePublicClient: () => ({ waitForTransactionReceipt }),
  useReadContract: () => ({ data: settledUpTo }),
}));

function renderTicket(props: Partial<React.ComponentProps<typeof OrderTicket>> = {}) {
  return render(
    <ToastProvider>
      <OrderTicket
        campaign={CAMPAIGN}
        cohortIndex={2}
        currentCohort={2}
        yourShares={500}
        {...props}
      />
    </ToastProvider>
  );
}

async function placeOrder(
  user: ReturnType<typeof userEvent.setup>,
  { side, price, size }: { side: "Buy" | "Sell"; price: string; size: string }
) {
  if (side === "Sell") await user.click(screen.getByRole("tab", { name: "Sell" }));
  await user.type(screen.getByLabelText(/Price per share/), price);
  await user.type(screen.getByLabelText("Shares"), size);
  await user.click(screen.getByRole("button", { name: side === "Buy" ? "Sign bid" : "Sign ask" }));
}

function signedOrder() {
  return signOrder.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  // Date.now() feeds the nonce and the deadline; pinning the clock makes both
  // assertable instead of merely "some bigint".
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-08T12:00:00.000Z"));
  vi.clearAllMocks();
  allowance = maxUint256;
  settledUpTo = 5n;
  wallet = {
    status: "connected",
    address: WALLET,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
  };
  signOrder.mockResolvedValue("0xsignature");
  submitOrder.mockResolvedValue({ id: "order-1" });
  approve.mockResolvedValue("0xapprove");
  settleTo.mockResolvedValue("0xsettle");
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

afterEach(() => vi.useRealTimers());

describe("OrderTicket validation", () => {
  it("keeps the ticket unsigned until both legs are filled in", async () => {
    const user = userEvent.setup();
    renderTicket();

    expect(screen.getByRole("button", { name: "Sign bid" })).toBeDisabled();

    await user.type(screen.getByLabelText(/Price per share/), "1.2");
    expect(screen.getByRole("button", { name: "Sign bid" })).toBeDisabled();

    await user.type(screen.getByLabelText("Shares"), "100");
    expect(screen.getByRole("button", { name: "Sign bid" })).toBeEnabled();
  });

  it("refuses to sell more shares than the cohort holds", async () => {
    const user = userEvent.setup();
    renderTicket({ yourShares: 500 });

    await user.click(screen.getByRole("tab", { name: "Sell" }));
    await user.type(screen.getByLabelText(/Price per share/), "1.2");
    await user.type(screen.getByLabelText("Shares"), "600");

    expect(screen.getByRole("alert")).toHaveTextContent("You hold 500 shares in this cohort");
    expect(screen.getByRole("button", { name: "Sign ask" })).toBeDisabled();
  });

  it("does not limit the size on the buy side", async () => {
    const user = userEvent.setup();
    renderTicket({ yourShares: 0 });

    await user.type(screen.getByLabelText(/Price per share/), "1.2");
    await user.type(screen.getByLabelText("Shares"), "600");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign bid" })).toBeEnabled();
  });

  /**
   * Price and size are each within the token's six decimals, but their product
   * is not: 0.001 × 0.0004 is 4e-7 USDC, which is zero in base units. The float
   * check `total > 0` passes while the signed struct carries usdcAmount = 0 —
   * an order that hands over shares for nothing, fillable by anyone.
   */
  it("refuses an order whose total rounds to zero in base units", async () => {
    const user = userEvent.setup();
    renderTicket();

    await user.type(screen.getByLabelText(/Price per share/), "0.001");
    await user.type(screen.getByLabelText("Shares"), "0.0004");

    expect(screen.getByRole("button", { name: "Sign bid" })).toBeDisabled();
  });

  it("refuses an order whose size rounds to zero in base units", async () => {
    const user = userEvent.setup();
    renderTicket();

    await user.type(screen.getByLabelText(/Price per share/), "1000000");
    await user.type(screen.getByLabelText("Shares"), "0.0000004");

    expect(screen.getByRole("button", { name: "Sign bid" })).toBeDisabled();
  });

  it("stays unsigned without a connected wallet", async () => {
    wallet = { ...wallet, status: "disconnected", address: undefined };
    const user = userEvent.setup();
    renderTicket();

    await user.type(screen.getByLabelText(/Price per share/), "1.2");
    await user.type(screen.getByLabelText("Shares"), "100");

    expect(screen.getByRole("button", { name: "Sign bid" })).toBeDisabled();
  });
});

describe("OrderTicket signing", () => {
  /**
   * usdcAmount is the total for the whole order, not the unit price — the
   * contract multiplies nothing. A per-share value here would sell 100 shares
   * for 1.2 USDC instead of 120.
   */
  it("signs the total, not the unit price", async () => {
    const user = userEvent.setup();
    renderTicket({ cohortIndex: 2 });

    await placeOrder(user, { side: "Buy", price: "1.2", size: "100" });

    await waitFor(() => expect(signOrder).toHaveBeenCalled());
    expect(signedOrder()).toMatchObject({
      maker: WALLET,
      isSell: false,
      cohortId: 2n,
      shareAmount: 100_000_000n,
      usdcAmount: 120_000_000n,
    });
  });

  it("marks the sell side on the struct", async () => {
    const user = userEvent.setup();
    renderTicket();

    await placeOrder(user, { side: "Sell", price: "2", size: "50" });

    await waitFor(() => expect(signOrder).toHaveBeenCalled());
    expect(signedOrder()).toMatchObject({ isSell: true, usdcAmount: 100_000_000n });
  });

  it("sets a deadline one week out", async () => {
    const user = userEvent.setup();
    renderTicket();

    await placeOrder(user, { side: "Buy", price: "1", size: "1" });

    await waitFor(() => expect(signOrder).toHaveBeenCalled());
    const issuedAt = Math.floor(new Date("2026-09-08T12:00:00.000Z").getTime() / 1000);
    expect(signedOrder().deadline).toBe(BigInt(issuedAt + 7 * 86_400));
  });

  it("publishes the signed order as decimal strings", async () => {
    const user = userEvent.setup();
    renderTicket({ cohortIndex: 3 });

    await placeOrder(user, { side: "Buy", price: "1.5", size: "10" });

    await waitFor(() => expect(submitOrder).toHaveBeenCalled());
    const [campaign, dto, signature] = submitOrder.mock.calls[0];
    expect(campaign).toBe(CAMPAIGN);
    expect(signature).toBe("0xsignature");
    expect(dto).toMatchObject({
      maker: WALLET,
      isSell: false,
      cohortId: "3",
      shareAmount: "10000000",
      usdcAmount: "15000000",
    });
  });

  it("clears the ticket once the order is resting", async () => {
    const user = userEvent.setup();
    renderTicket();

    await placeOrder(user, { side: "Buy", price: "1.5", size: "10" });

    await waitFor(() => expect(screen.getByLabelText("Shares")).toHaveValue(""));
    expect(screen.getByLabelText(/Price per share/)).toHaveValue("");
  });
});

describe("OrderTicket preflight", () => {
  /**
   * A fill pulls USDC from the maker, so a bid without an allowance is a resting
   * order that reverts for whoever tries to take it. The approval is part of
   * placing the order, not of filling it.
   */
  it("approves the campaign before resting a bid", async () => {
    allowance = 0n;
    const user = userEvent.setup();
    renderTicket();

    await placeOrder(user, { side: "Buy", price: "1", size: "100" });

    await waitFor(() => expect(signOrder).toHaveBeenCalled());
    expect(approve).toHaveBeenCalledWith(CAMPAIGN, maxUint256);
    expect(approve.mock.invocationCallOrder[0]).toBeLessThan(
      signOrder.mock.invocationCallOrder[0]
    );
  });

  it("skips the approval when the allowance already covers the total", async () => {
    allowance = maxUint256;
    const user = userEvent.setup();
    renderTicket();

    await placeOrder(user, { side: "Buy", price: "1", size: "100" });

    await waitFor(() => expect(signOrder).toHaveBeenCalled());
    expect(approve).not.toHaveBeenCalled();
  });

  // fillOrder reverts with MakerNotSettled unless the maker's shares have been
  // materialised up to the head cohort.
  it("settles the maker before resting an ask", async () => {
    settledUpTo = 0n;
    const user = userEvent.setup();
    renderTicket({ currentCohort: 4 });

    await placeOrder(user, { side: "Sell", price: "1", size: "10" });

    await waitFor(() => expect(signOrder).toHaveBeenCalled());
    expect(settleTo).toHaveBeenCalledWith(WALLET, 4n);
  });

  it("skips settlement when the maker is already at the head cohort", async () => {
    settledUpTo = 4n;
    const user = userEvent.setup();
    renderTicket({ currentCohort: 4 });

    await placeOrder(user, { side: "Sell", price: "1", size: "10" });

    await waitFor(() => expect(signOrder).toHaveBeenCalled());
    expect(settleTo).not.toHaveBeenCalled();
  });

  it("never approves on the sell side", async () => {
    allowance = 0n;
    const user = userEvent.setup();
    renderTicket();

    await placeOrder(user, { side: "Sell", price: "1", size: "10" });

    await waitFor(() => expect(signOrder).toHaveBeenCalled());
    expect(approve).not.toHaveBeenCalled();
  });
});

describe("OrderTicket failure handling", () => {
  it("does not publish an order the user declined to sign", async () => {
    signOrder.mockRejectedValue(new Error("User rejected the request"));
    const user = userEvent.setup();
    renderTicket();

    await placeOrder(user, { side: "Buy", price: "1", size: "10" });

    expect(await screen.findByText("Order not placed")).toBeInTheDocument();
    expect(submitOrder).not.toHaveBeenCalled();
  });

  // viem attaches a readable one-liner as shortMessage; the raw `message` is a
  // multi-paragraph dump that does not belong in a toast.
  it("prefers the wallet's short message when there is one", async () => {
    signOrder.mockRejectedValue(
      Object.assign(new Error("Long RPC dump\nwith details"), {
        shortMessage: "User rejected the request.",
      })
    );
    const user = userEvent.setup();
    renderTicket();

    await placeOrder(user, { side: "Buy", price: "1", size: "10" });

    expect(await screen.findByText("User rejected the request.")).toBeInTheDocument();
  });

  it("keeps the ticket filled in when publishing fails", async () => {
    submitOrder.mockRejectedValue(new Error("Backend unavailable"));
    const user = userEvent.setup();
    renderTicket();

    await placeOrder(user, { side: "Buy", price: "1.5", size: "10" });

    expect(await screen.findByText("Order not placed")).toBeInTheDocument();
    expect(screen.getByLabelText("Shares")).toHaveValue("10");
  });
});
