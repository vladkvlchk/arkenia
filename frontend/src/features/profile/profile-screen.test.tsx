import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/ui";
import type { AccountPosition, ApiActivityItem } from "@/lib/api/client";
import type { WalletView } from "@/shared/lib/mock-wallet";
import { ProfileScreen } from "./profile-screen";

/**
 * The profile totals every position the account holds, so its headline figures
 * are sums the user cannot check by eye. It also decides how many wallet
 * signatures a claim needs — one per campaign — which is the difference between
 * a click and a queue of prompts.
 *
 * useClaimAll is deliberately left real: the masking it applies after a claim is
 * exactly what these totals have to reflect.
 */
const { writeContractAsync, waitForTransactionReceipt } = vi.hoisted(() => ({
  writeContractAsync: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}));

let positions: AccountPosition[] = [];
let history: ApiActivityItem[] = [];
let wallet: WalletView;

vi.mock("@/shared/lib/mock-wallet", () => ({ useWallet: () => wallet }));

vi.mock("@/lib/hooks/api", () => ({
  useApiAccountPositions: () => ({ data: positions }),
  useApiAccountActivity: () => ({ data: history }),
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useWriteContract: () => ({ writeContractAsync }),
  usePublicClient: () => ({ waitForTransactionReceipt }),
  useAccount: () => ({ isConnected: true, chainId: undefined }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
}));

const AURORA = "0xce9ce282137528c916a15ad5542403bff51845ca" as const;
const MERIDIAN = "0x011fca24bfc4aff93cb35b8bd2a74f3b3110eeba" as const;
const VIEWER = "0x1234567890abcdef1234567890abcdef12345678" as const;

function position(overrides: Partial<AccountPosition> & { campaignAddress: `0x${string}` }): AccountPosition {
  return {
    campaignName: "Aurora Compute",
    status: "returning",
    refundable: 100,
    accrued: 0,
    totalClaimable: 25,
    cohorts: [{ index: 1, shares: 400, claimable: 25 }],
    ...overrides,
  };
}

function renderProfile(props: React.ComponentProps<typeof ProfileScreen> = {}) {
  return render(
    <ToastProvider>
      <ProfileScreen {...props} />
    </ToastProvider>
  );
}

/**
 * Reads the figure rendered under a Stat's label. Some labels are also table
 * column headers further down the page, so the header cells are excluded rather
 * than the query being tied to a styling class.
 */
function statValue(label: string) {
  const heading = screen.getAllByText(label).find((node) => node.tagName !== "TH");
  return heading?.parentElement?.textContent?.replace(/\s/g, " ") ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  positions = [];
  history = [];
  wallet = {
    status: "connected",
    address: VIEWER,
    tokenBalance: 900,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
  };
  writeContractAsync.mockResolvedValue("0xtx");
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("ProfileScreen access", () => {
  it("asks the viewer to connect before showing their own profile", async () => {
    wallet = { ...wallet, status: "disconnected", address: undefined };
    const user = userEvent.setup();
    renderProfile();

    expect(screen.getByText("Connect to see your profile")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(wallet.connect).toHaveBeenCalled();
  });

  // Another account's profile is public — it needs no wallet at all, and
  // gating it behind one would break every shared link.
  it("renders another account without requiring a connection", () => {
    wallet = { ...wallet, status: "disconnected", address: undefined };
    positions = [position({ campaignAddress: AURORA })];
    renderProfile({ address: AURORA });

    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByText("Connect to see your profile")).not.toBeInTheDocument();
  });

  // Claiming is an action on your own funds; the read-only view must not offer it.
  it("offers no claim control when viewing someone else", () => {
    positions = [position({ campaignAddress: AURORA, totalClaimable: 25 })];
    renderProfile({ address: AURORA });

    expect(screen.queryByRole("button", { name: /Claim all/ })).not.toBeInTheDocument();
  });
});

describe("ProfileScreen totals", () => {
  it("sums balances across every campaign", () => {
    positions = [
      position({
        campaignAddress: AURORA,
        refundable: 100,
        totalClaimable: 25,
        cohorts: [{ index: 1, shares: 400, claimable: 25 }],
      }),
      position({
        campaignAddress: MERIDIAN,
        campaignName: "Meridian Yield",
        refundable: 250,
        totalClaimable: 75,
        cohorts: [
          { index: 1, shares: 100, claimable: 50 },
          { index: 2, shares: 200, claimable: 25 },
        ],
      }),
    ];
    renderProfile();

    expect(statValue("Pool · refundable")).toContain("350");
    expect(statValue("Claimable now")).toContain("100");
    expect(statValue("Cohort shares")).toContain("700");
  });

  it("counts cohorts across campaigns, not campaigns alone", () => {
    positions = [
      position({ campaignAddress: AURORA, cohorts: [{ index: 1, shares: 400, claimable: 0 }] }),
      position({
        campaignAddress: MERIDIAN,
        cohorts: [
          { index: 1, shares: 100, claimable: 0 },
          { index: 2, shares: 200, claimable: 0 },
        ],
      }),
    ];
    renderProfile();

    expect(screen.getByText("Across 3 cohorts · 2 campaigns")).toBeInTheDocument();
  });

  it("shows zeroes rather than blanks for an account with no positions", () => {
    renderProfile();

    expect(statValue("Pool · refundable")).toContain("0");
    expect(screen.getByRole("button", { name: "Claim all" })).toBeDisabled();
  });
});

describe("ProfileScreen claiming", () => {
  /**
   * claim() is per-campaign, so a cross-campaign claim is a queue of wallet
   * prompts. Saying so up front is the difference between a user who waits and
   * one who abandons the flow at the second signature request.
   */
  it("warns how many signatures a claim will need", () => {
    positions = [
      position({ campaignAddress: AURORA, totalClaimable: 25 }),
      position({ campaignAddress: MERIDIAN, totalClaimable: 75 }),
    ];
    renderProfile();

    expect(screen.getByText("2 transactions — one per campaign")).toBeInTheDocument();
  });

  it("stays quiet about the count when one signature is enough", () => {
    positions = [position({ campaignAddress: AURORA, totalClaimable: 25 })];
    renderProfile();

    expect(screen.queryByText(/transactions — one per campaign/)).not.toBeInTheDocument();
  });

  // The totals render from the masked positions, so a claimed amount stops
  // being offered even while the indexer still reports it.
  it("drops the claimed amount out of the total once it lands", async () => {
    positions = [position({ campaignAddress: AURORA, totalClaimable: 25 })];
    const user = userEvent.setup();
    renderProfile();

    await user.click(screen.getByRole("button", { name: "Claim all" }));

    await waitFor(() => expect(statValue("Claimable now")).toContain("0"));
    expect(screen.getByRole("button", { name: "Claim all" })).toBeDisabled();
  });
});

describe("ProfileScreen positions table", () => {
  it("points an account with nothing at the campaign index", () => {
    renderProfile();

    expect(screen.getByText("No positions yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse campaigns" })).toHaveAttribute(
      "href",
      "/campaigns"
    );
  });

  it("links each row to its campaign", () => {
    positions = [position({ campaignAddress: AURORA, campaignName: "Aurora Compute" })];
    renderProfile();

    expect(screen.getByRole("link", { name: "Open Aurora Compute" })).toHaveAttribute(
      "href",
      `/campaign/${AURORA}`
    );
  });

  it("lists the cohorts held per campaign", () => {
    positions = [
      position({
        campaignAddress: AURORA,
        cohorts: [
          { index: 1, shares: 400, claimable: 0 },
          { index: 3, shares: 150, claimable: 0 },
        ],
      }),
    ];
    renderProfile();

    const row = screen.getByText("Aurora Compute").closest("tr") as HTMLElement;
    expect(within(row).getByText(/#1 · 400/)).toBeInTheDocument();
    expect(within(row).getByText(/#3 · 150/)).toBeInTheDocument();
  });

  it("marks a campaign with no cohort shares", () => {
    positions = [position({ campaignAddress: AURORA, cohorts: [], totalClaimable: 0 })];
    renderProfile();

    const row = screen.getByText("Aurora Compute").closest("tr") as HTMLElement;
    expect(within(row).getAllByText("—")).not.toHaveLength(0);
  });
});

describe("ProfileScreen history", () => {
  function activity(overrides: Partial<ApiActivityItem> & { id: string }): ApiActivityItem {
    return {
      type: "deposit",
      actor: VIEWER,
      amount: 100,
      txHash: "0xabc" as `0x${string}`,
      at: "2026-03-12T10:00:00.000Z",
      campaignAddress: AURORA,
      ...overrides,
    };
  }

  async function openHistory() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "History" }));
    return user;
  }

  it("explains an empty history", async () => {
    renderProfile();
    await openHistory();

    expect(screen.getByText("No history yet")).toBeInTheDocument();
  });

  /**
   * A history row names its campaign. The positions list is the best source,
   * but it only covers campaigns the account still holds — the seed table and
   * then the address itself cover the rest, so no row is ever nameless.
   */
  it("names a campaign the account no longer holds", async () => {
    positions = [];
    history = [activity({ id: "1", campaignAddress: AURORA })];
    renderProfile();
    await openHistory();

    expect(screen.getByText("Aurora Compute")).toBeInTheDocument();
  });

  it("falls back to the address for a campaign nothing knows about", async () => {
    positions = [];
    history = [activity({ id: "1", campaignAddress: VIEWER })];
    renderProfile();
    await openHistory();

    // Scoped to the table: the same truncation renders in the page header for
    // the account being viewed, which happens to be the same address here.
    expect(within(screen.getByRole("table")).getByText("0x1234…5678")).toBeInTheDocument();
  });

  it("describes cohort-scoped events by their cohort", async () => {
    history = [
      activity({ id: "1", type: "deposit" }),
      activity({ id: "2", type: "withdraw", cohortIndex: 3 }),
      activity({ id: "3", type: "refund" }),
    ];
    renderProfile();
    await openHistory();

    expect(screen.getByText("Pool")).toBeInTheDocument();
    expect(screen.getByText("Cohort #3 minted")).toBeInTheDocument();
    expect(screen.getByText("Pool · 1:1")).toBeInTheDocument();
  });

  // `claim` settles every held cohort in one event and `returnFundsToAll` is
  // campaign-wide, so neither arrives with a cohortIndex. Both used to render a
  // literal "Cohort #undefined" into the history table.
  it("describes campaign-wide events without inventing a cohort", async () => {
    history = [
      activity({ id: "1", type: "claim" }),
      activity({ id: "2", type: "return" }),
    ];
    renderProfile();
    await openHistory();

    expect(screen.getAllByText("All cohorts")).toHaveLength(2);
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  // The indexer can grow a type before this screen learns about it, and losing
  // the whole history tab over one unmapped row is a poor trade.
  it("survives an event type it does not recognise", async () => {
    history = [
      activity({ id: "1", type: "deposit" }),
      activity({ id: "2", type: "trade" as ApiActivityItem["type"] }),
    ];
    renderProfile();
    await openHistory();

    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("trade")).toBeInTheDocument();
  });
});
