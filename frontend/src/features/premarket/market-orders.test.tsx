import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { maxUint256 } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/ui";
import type { ApiOrder } from "@/lib/api/client";
import type { WalletView } from "@/shared/lib/mock-wallet";
import { MarketOrders } from "./market-orders";

/**
 * Filling is the settlement half of the premarket. The order struct handed to
 * fillOrder has to reproduce what the maker signed field for field — the
 * contract recovers the signer from those exact bytes, so a single value
 * rebuilt wrongly turns every fill into an InvalidSignature revert.
 */
const { fillOrder, approve, waitForTransactionReceipt } = vi.hoisted(() => ({
  fillOrder: vi.fn(),
  approve: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

let allowance = 0n;
let wallet: WalletView;

vi.mock("@/shared/lib/mock-wallet", () => ({ useWallet: () => wallet }));
vi.mock("@/lib/hooks/premarket", () => ({ usePremarket: () => ({ fillOrder }) }));
vi.mock("@/lib/hooks/campaign", () => ({
  useTokenActions: () => ({ approve }),
  useToken: () => ({ allowance }),
}));
vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  usePublicClient: () => ({ waitForTransactionReceipt }),
}));

const CAMPAIGN = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;
const MAKER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const TAKER = "0x1234567890abcdef1234567890abcdef12345678" as const;

function order(overrides: Partial<ApiOrder> = {}): ApiOrder {
  const side = overrides.side ?? "ask";
  return {
    id: "order-1",
    campaignAddress: CAMPAIGN,
    cohortIndex: 2,
    side,
    price: 1.5,
    size: 100,
    filled: 0,
    remaining: 100,
    status: "live",
    maker: MAKER,
    placedAt: "2026-09-01T10:00:00.000Z",
    deadline: "2026-09-08T10:00:00.000Z",
    fill: {
      order: {
        maker: MAKER,
        isSell: side === "ask",
        cohortId: "2",
        shareAmount: "100000000",
        usdcAmount: "150000000",
        nonce: "42",
        deadline: "1788000000",
      },
      signature: "0xsignature" as `0x${string}`,
    },
    ...overrides,
  };
}

const onFilled = vi.fn();

function renderOrders(props: Partial<React.ComponentProps<typeof MarketOrders>> = {}) {
  return render(
    <ToastProvider>
      <MarketOrders
        campaign={CAMPAIGN}
        orders={[order()]}
        yourShares={500}
        onFilled={onFilled}
        {...props}
      />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  allowance = maxUint256;
  wallet = {
    status: "connected",
    address: TAKER,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
  };
  fillOrder.mockResolvedValue("0xfill");
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("MarketOrders listing", () => {
  it("explains the empty book rather than showing a bare table", () => {
    renderOrders({ orders: [] });

    expect(screen.getByText("No orders from other makers")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  // The verb has to match what the taker does, not what the maker did: an ask
  // is someone selling, so taking it is buying.
  it("labels the action from the taker's side", () => {
    renderOrders({ orders: [order({ id: "a", side: "ask" }), order({ id: "b", side: "bid" })] });

    expect(screen.getByRole("button", { name: "Buy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sell" })).toBeInTheDocument();
  });

  it("cannot be filled without a connected wallet", () => {
    wallet = { ...wallet, status: "disconnected", address: undefined };
    renderOrders();

    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
  });
});

describe("MarketOrders limits", () => {
  it("caps a buy at what remains in the order", async () => {
    const user = userEvent.setup();
    renderOrders({ orders: [order({ side: "ask", remaining: 40 })] });

    await user.click(screen.getByRole("button", { name: "Buy" }));
    await user.type(await screen.findByLabelText("Shares"), "50");

    expect(screen.getByRole("alert")).toHaveTextContent("Only 40 shares remain in this order");
    expect(screen.getByRole("button", { name: "Buy shares" })).toBeDisabled();
  });

  /**
   * Taking a bid hands over cohort shares, so the ceiling is the lower of what
   * the order still wants and what the taker actually holds. Offering more than
   * they hold would revert after the wallet prompt.
   */
  it("caps a sell at the shares the taker holds", async () => {
    const user = userEvent.setup();
    renderOrders({ orders: [order({ side: "bid", remaining: 100 })], yourShares: 30 });

    await user.click(screen.getByRole("button", { name: "Sell" }));
    await user.type(await screen.findByLabelText("Shares"), "50");

    expect(screen.getByRole("alert")).toHaveTextContent("You can sell at most 30 shares");
    expect(screen.getByRole("button", { name: "Sell shares" })).toBeDisabled();
  });

  it("caps a sell at the order's remaining size when that is lower", async () => {
    const user = userEvent.setup();
    renderOrders({ orders: [order({ side: "bid", remaining: 20 })], yourShares: 500 });

    await user.click(screen.getByRole("button", { name: "Sell" }));
    await user.type(await screen.findByLabelText("Shares"), "25");

    expect(screen.getByRole("alert")).toHaveTextContent("You can sell at most 20 shares");
  });

  it("shows the cost of the fill before it is signed", async () => {
    const user = userEvent.setup();
    renderOrders({ orders: [order({ side: "ask", price: 1.5 })] });

    await user.click(screen.getByRole("button", { name: "Buy" }));
    await user.type(await screen.findByLabelText("Shares"), "10");

    // 10 shares at 1.5 → 15.00
    expect(screen.getByRole("dialog")).toHaveTextContent("15.00");
  });
});

describe("MarketOrders settlement", () => {
  async function fillShares(shares: string, orderOverrides: Partial<ApiOrder> = {}) {
    const user = userEvent.setup();
    const side = orderOverrides.side ?? "ask";
    renderOrders({ orders: [order(orderOverrides)] });
    await user.click(screen.getByRole("button", { name: side === "ask" ? "Buy" : "Sell" }));
    await user.type(await screen.findByLabelText("Shares"), shares);
    await user.click(
      screen.getByRole("button", { name: side === "ask" ? "Buy shares" : "Sell shares" })
    );
    return user;
  }

  /**
   * The struct arrives from the backend as decimal strings and has to become
   * the same integers the maker signed. Rebuilding it is the one place a
   * signature can be invalidated without anyone touching the signature.
   */
  it("reproduces the signed struct exactly", async () => {
    await fillShares("10");

    await waitFor(() => expect(fillOrder).toHaveBeenCalled());
    const [struct, signature, shares] = fillOrder.mock.calls[0];
    expect(struct).toEqual({
      maker: MAKER,
      isSell: true,
      cohortId: 2n,
      shareAmount: 100_000_000n,
      usdcAmount: 150_000_000n,
      nonce: 42n,
      deadline: 1_788_000_000n,
    });
    expect(signature).toBe("0xsignature");
    // A partial fill: ten of the hundred shares the order offers.
    expect(shares).toBe(10_000_000n);
  });

  // The contract rounds the USDC leg up, so an allowance for exactly the quoted
  // cost can fall a unit short and revert the fill.
  it("approves with headroom before buying", async () => {
    allowance = 0n;
    await fillShares("10");

    await waitFor(() => expect(fillOrder).toHaveBeenCalled());
    expect(approve).toHaveBeenCalledWith(CAMPAIGN, maxUint256);
    expect(approve.mock.invocationCallOrder[0]).toBeLessThan(fillOrder.mock.invocationCallOrder[0]);
  });

  it("skips the approval when the allowance already covers the cost", async () => {
    allowance = maxUint256;
    await fillShares("10");

    await waitFor(() => expect(fillOrder).toHaveBeenCalled());
    expect(approve).not.toHaveBeenCalled();
  });

  // Selling moves shares, not tokens — the taker owes no USDC and needs no
  // allowance, so prompting for one would be a pointless extra signature.
  it("never approves when selling into a bid", async () => {
    allowance = 0n;
    await fillShares("10", { side: "bid" });

    await waitFor(() => expect(fillOrder).toHaveBeenCalled());
    expect(approve).not.toHaveBeenCalled();
  });

  // The parent uses this to hide the filled size until the indexer catches up.
  it("reports the confirmed fill to the parent", async () => {
    await fillShares("10");

    await waitFor(() => expect(onFilled).toHaveBeenCalledWith("order-1", 10));
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xfill" });
  });

  it("closes the dialog once the fill confirms", async () => {
    await fillShares("10");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("MarketOrders failure handling", () => {
  it("reports a failed fill and tells the parent nothing", async () => {
    fillOrder.mockRejectedValue(
      Object.assign(new Error("dump"), { shortMessage: "Order already filled." })
    );
    const user = userEvent.setup();
    renderOrders();

    await user.click(screen.getByRole("button", { name: "Buy" }));
    await user.type(await screen.findByLabelText("Shares"), "10");
    await user.click(screen.getByRole("button", { name: "Buy shares" }));

    expect(await screen.findByText("Order already filled.")).toBeInTheDocument();
    expect(onFilled).not.toHaveBeenCalled();
  });

  it("keeps the dialog open so the amount can be retried", async () => {
    fillOrder.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    renderOrders();

    await user.click(screen.getByRole("button", { name: "Buy" }));
    await user.type(await screen.findByLabelText("Shares"), "10");
    await user.click(screen.getByRole("button", { name: "Buy shares" }));

    expect(await screen.findByText("Fill failed")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Shares")).toHaveValue("10");
  });
});
