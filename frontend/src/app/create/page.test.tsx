import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/ui";
import { ApiError, buildMetadataMessage } from "@/lib/api/client";
import { activeChain } from "@/lib/config";
import { TOKEN_ADDRESS } from "@/shared/config";
import type { WalletView } from "@/shared/lib/mock-wallet";
import CreatePage from "./page";

/**
 * Creating a campaign spans two systems that fail independently: the contract
 * deploy, which is atomic, and the off-chain metadata write, which is not. The
 * design decision worth protecting is that the second never costs the first —
 * a campaign that exists on chain must never end up nameless because its cover
 * image could not be stored.
 */
const {
  createCampaign,
  waitForTransactionReceipt,
  signMessageAsync,
  putMetadata,
  decodeEventLog,
  push,
} = vi.hoisted(() => ({
  createCampaign: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  signMessageAsync: vi.fn(),
  putMetadata: vi.fn(),
  decodeEventLog: vi.fn(),
  push: vi.fn(),
}));

let wallet: WalletView;

vi.mock("@/shared/lib/mock-wallet", () => ({ useWallet: () => wallet }));
vi.mock("@/lib/hooks/campaign", () => ({ useCreateCampaign: () => ({ createCampaign }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  api: { putMetadata },
}));
vi.mock("viem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("viem")>()),
  decodeEventLog,
}));
vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  usePublicClient: () => ({ waitForTransactionReceipt }),
  useSignMessage: () => ({ signMessageAsync }),
}));

// API_ENABLED gates the whole metadata path; the tests need it on.
vi.mock("@/shared/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/config")>()),
  API_ENABLED: true,
}));

const NEW_CAMPAIGN = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;
const ANGEL = "0x1234567890abcdef1234567890abcdef12345678" as const;

function renderPage() {
  return render(
    <ToastProvider>
      <CreatePage />
    </ToastProvider>
  );
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  { name = "Aurora Compute", description = "" } = {}
) {
  await user.type(screen.getByLabelText("Campaign name"), name);
  if (description) await user.type(screen.getByLabelText("Description"), description);
  await user.click(screen.getByRole("button", { name: /Create campaign/ }));
}

/** The metadata body of the nth putMetadata call, and whether it carried a cover. */
function metadataCall(index: number) {
  const [campaign, body, cover] = putMetadata.mock.calls[index];
  return { campaign, body, cover };
}

beforeEach(() => {
  vi.clearAllMocks();
  wallet = {
    status: "connected",
    address: ANGEL,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
  };
  createCampaign.mockResolvedValue("0xcreate");
  waitForTransactionReceipt.mockResolvedValue({ logs: [{ data: "0x", topics: [] }] });
  decodeEventLog.mockReturnValue({
    eventName: "CampaignCreated",
    args: { campaign: NEW_CAMPAIGN },
  });
  signMessageAsync.mockResolvedValue("0xsignature");
  putMetadata.mockResolvedValue({});
});

describe("CreatePage validation", () => {
  // Creation needs an angel wallet, so the primary action becomes the thing
  // that unblocks it rather than a disabled button with no explanation.
  it("offers to connect instead of a dead create button", async () => {
    wallet = { ...wallet, status: "disconnected", address: undefined, connect: vi.fn() };
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole("button", { name: /Create campaign/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect wallet to create" }));

    expect(wallet.connect).toHaveBeenCalledTimes(1);
  });

  // A name is the only field a campaign genuinely needs, and it is what every
  // card and link renders — a one-character name is not one.
  it("requires a name of at least three characters", async () => {
    const user = userEvent.setup();
    renderPage();
    const button = screen.getByRole("button", { name: /Create campaign/ });

    await user.type(screen.getByLabelText("Campaign name"), "Au");
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText("Campaign name"), "rora");
    expect(button).toBeEnabled();
  });

  it("ignores a name that is only whitespace", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Campaign name"), "    ");

    expect(screen.getByRole("button", { name: /Create campaign/ })).toBeDisabled();
  });
});

describe("CreatePage cover selection", () => {
  function coverInput() {
    return document.querySelector('input[type="file"]') as HTMLInputElement;
  }

  function fileOfSize(bytes: number, name = "cover.png") {
    return new File([new Uint8Array(bytes)], name, { type: "image/png" });
  }

  /**
   * The cap mirrors the backend's. Rejecting oversized images here — rather
   * than letting the proxy answer 413 after the campaign already exists — keeps
   * the failure in front of the user while they can still act on it.
   */
  it("rejects an image above the size cap before anything is uploaded", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(coverInput(), fileOfSize(5 * 1024 * 1024 + 1));

    expect(await screen.findByText("Image too large")).toBeInTheDocument();
  });

  it("accepts an image inside the cap", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.upload(coverInput(), fileOfSize(1024));

    expect(screen.queryByText("Image too large")).not.toBeInTheDocument();
  });
});

describe("CreatePage deployment", () => {
  it("deploys against the configured fundraising token", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user);

    await waitFor(() => expect(createCampaign).toHaveBeenCalledWith(TOKEN_ADDRESS));
  });

  // The clone address only exists in the factory's event, and it is what the
  // user is navigated to.
  it("navigates to the campaign it just deployed", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/campaign/${NEW_CAMPAIGN}`));
  });

  /**
   * A receipt whose logs cannot be decoded still means the campaign exists —
   * falling back to the index beats stranding the user on a form that looks as
   * though nothing happened.
   */
  it("falls back to the index when the address cannot be recovered", async () => {
    decodeEventLog.mockImplementation(() => {
      throw new Error("not a factory event");
    });
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith("/campaigns"));
  });

  it("reports a rejected deployment and stays on the form", async () => {
    createCampaign.mockRejectedValue(new Error("User rejected the request"));
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user);

    expect(await screen.findByText("Creation failed")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("CreatePage metadata authorisation", () => {
  // The backend recovers the angel from this exact string; anything else
  // recovers a different address and is rejected as unauthorised.
  it("signs the canonical metadata message", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user, { name: "Aurora Compute", description: "GPU cycles." });

    await waitFor(() => expect(signMessageAsync).toHaveBeenCalled());
    const { message } = signMessageAsync.mock.calls[0][0];
    const { body } = metadataCall(0);
    expect(message).toBe(
      buildMetadataMessage(
        activeChain.id,
        NEW_CAMPAIGN,
        "Aurora Compute",
        "GPU cycles.",
        body.issuedAt
      )
    );
  });

  it("trims the name and description it signs and stores", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user, { name: "  Aurora Compute  ", description: "  GPU cycles.  " });

    await waitFor(() => expect(putMetadata).toHaveBeenCalled());
    expect(metadataCall(0).body).toMatchObject({
      name: "Aurora Compute",
      description: "GPU cycles.",
    });
  });

  /**
   * Declining the signature is not a failed creation — the contract is already
   * deployed. Saying so is the difference between a user who renames the
   * campaign later and one who deploys a second one.
   */
  it("still reports the campaign as live when the signature is declined", async () => {
    signMessageAsync.mockRejectedValue(new Error("User rejected the request"));
    const user = userEvent.setup();
    renderPage();

    await fillAndSubmit(user);

    expect(await screen.findByText("Name not saved")).toBeInTheDocument();
    expect(putMetadata).not.toHaveBeenCalled();
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/campaign/${NEW_CAMPAIGN}`));
  });
});

describe("CreatePage metadata persistence", () => {
  function coverInput() {
    return document.querySelector('input[type="file"]') as HTMLInputElement;
  }

  async function submitWithCover(user: ReturnType<typeof userEvent.setup>) {
    renderPage();
    await user.upload(coverInput(), new File(["cover"], "cover.png", { type: "image/png" }));
    await fillAndSubmit(user);
  }

  it("uploads the cover alongside the name", async () => {
    const user = userEvent.setup();
    await submitWithCover(user);

    await waitFor(() => expect(putMetadata).toHaveBeenCalled());
    expect(metadataCall(0).cover).toBeInstanceOf(File);
  });

  /**
   * The cover is the disposable half. When storage rejects it — a 413 at the
   * proxy, object storage down, an unsupported type — the write is retried
   * without it rather than abandoned, so the campaign keeps its name.
   */
  it("retries without the cover when storage rejects it", async () => {
    putMetadata
      .mockRejectedValueOnce(new ApiError("upload_failed", "Object storage unavailable", 502))
      .mockResolvedValueOnce({});
    const user = userEvent.setup();
    await submitWithCover(user);

    expect(await screen.findByText("Name saved — cover skipped")).toBeInTheDocument();
    expect(metadataCall(0).cover).toBeInstanceOf(File);
    expect(metadataCall(1).cover).toBeUndefined();
    expect(metadataCall(1).body).toMatchObject({ name: "Aurora Compute" });
  });

  /**
   * `unknown_campaign` is indexer lag, not a cover problem — the campaign is
   * simply newer than the backend's view of the chain. Dropping the cover here
   * would discard it for a reason that had nothing to do with it.
   */
  it("keeps the cover while waiting for the indexer to catch up", async () => {
    putMetadata
      .mockRejectedValueOnce(new ApiError("unknown_campaign", "Not indexed yet", 404))
      .mockResolvedValueOnce({});
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    await submitWithCover(user);

    await waitFor(() => expect(putMetadata).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(3000);

    await waitFor(() => expect(putMetadata).toHaveBeenCalledTimes(2));
    expect(metadataCall(1).cover).toBeInstanceOf(File);
    vi.useRealTimers();
  });

  // Each backend code maps to something the angel can act on; the generic
  // fallback still has to say the campaign itself is fine.
  it("explains a terminal failure in the angel's terms", async () => {
    putMetadata.mockRejectedValue(new ApiError("not_angel", "Signer mismatch", 403));
    const user = userEvent.setup();
    renderPage();
    await fillAndSubmit(user);

    expect(await screen.findByText("Couldn't save campaign details")).toBeInTheDocument();
    expect(
      screen.getByText(/save from the wallet that created it/)
    ).toBeInTheDocument();
  });

  it("names the campaign as live even when the metadata write fails", async () => {
    putMetadata.mockRejectedValue(new ApiError("invalid_metadata", "Too long", 400));
    const user = userEvent.setup();
    renderPage();
    await fillAndSubmit(user);

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/campaign/${NEW_CAMPAIGN}`));
    expect(await screen.findByText(/name or description was rejected/)).toBeInTheDocument();
  });
});

afterEach(() => vi.useRealTimers());
