import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeChain } from "@/lib/config";
import { CHAIN_NAME } from "@/shared/config";
import { NetworkPill } from "./network-pill";

/**
 * The pill reports the wallet's actual chain, not the app's target. That
 * distinction is the whole point: a wallet left on mainnet while the app talks
 * to a testnet contract will happily sign, and the transaction goes to an
 * address that means something different — or nothing — over there.
 */
const { switchChain } = vi.hoisted(() => ({ switchChain: vi.fn() }));

let account: { isConnected: boolean; chainId?: number };
let isPending = false;

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useAccount: () => account,
  useSwitchChain: () => ({ switchChain, isPending }),
}));

// Any chain that is not the configured one; derived rather than hardcoded so
// the test holds whichever contour the env points at.
const OTHER_CHAIN = activeChain.id + 1;

beforeEach(() => {
  vi.clearAllMocks();
  isPending = false;
  account = { isConnected: true, chainId: activeChain.id };
});

describe("NetworkPill on the right chain", () => {
  it("names the network without offering an action", () => {
    render(<NetworkPill />);

    expect(screen.getByText(CHAIN_NAME)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  // Before a wallet connects there is no chain to be wrong about, so the pill
  // states the target network rather than accusing the user of anything.
  it("stays passive while no wallet is connected", () => {
    account = { isConnected: false, chainId: undefined };
    render(<NetworkPill />);

    expect(screen.getByText(CHAIN_NAME)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  /**
   * A connected wallet whose chain has not been read yet is not on the wrong
   * chain — it is unknown. Treating undefined as a mismatch would flash a red
   * warning on every page load.
   */
  it("does not accuse a wallet whose chain has not resolved", () => {
    account = { isConnected: true, chainId: undefined };
    render(<NetworkPill />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("NetworkPill on the wrong chain", () => {
  it("names the network it will switch to", () => {
    account = { isConnected: true, chainId: OTHER_CHAIN };
    render(<NetworkPill />);

    expect(
      screen.getByRole("button", { name: `Wrong network → ${CHAIN_NAME}` })
    ).toBeInTheDocument();
  });

  it("switches to the app's chain in one click", async () => {
    account = { isConnected: true, chainId: OTHER_CHAIN };
    const user = userEvent.setup();
    render(<NetworkPill />);

    await user.click(screen.getByRole("button"));

    expect(switchChain).toHaveBeenCalledWith({ chainId: activeChain.id });
  });

  it("reports the switch in progress", () => {
    account = { isConnected: true, chainId: OTHER_CHAIN };
    isPending = true;
    render(<NetworkPill />);

    expect(screen.getByRole("button", { name: "Switching…" })).toBeInTheDocument();
  });
});
