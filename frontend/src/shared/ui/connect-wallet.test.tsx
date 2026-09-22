import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WalletView, WalletStatus } from "@/shared/lib/mock-wallet";
import { ConnectWallet } from "./connect-wallet";

/**
 * A four-state machine rendered in the header on every page. It takes its state
 * as a prop rather than reading a hook, which is what makes it testable without
 * standing up Privy or wagmi — the tests below are the payoff for that design.
 *
 * The state that matters most is "wrong-network": if it renders like a normal
 * connected wallet, the user transacts on the wrong chain.
 */
function wallet(status: WalletStatus, overrides: Partial<WalletView> = {}): WalletView {
  return {
    status,
    address: "0x1234567890abcdef1234567890abcdef12345678",
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchNetwork: vi.fn(),
    ...overrides,
  };
}

describe("ConnectWallet", () => {
  it("offers to connect while disconnected", async () => {
    const user = userEvent.setup();
    const connect = vi.fn();
    render(<ConnectWallet wallet={wallet("disconnected", { connect })} />);

    await user.click(screen.getByRole("button", { name: "Connect wallet" }));

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("blocks a second attempt while connecting", async () => {
    const user = userEvent.setup();
    const connect = vi.fn();
    render(<ConnectWallet wallet={wallet("connecting", { connect })} />);

    const button = screen.getByRole("button", { name: "Connecting" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(connect).not.toHaveBeenCalled();
  });

  // The wrong chain must never be mistakable for a working connection: the
  // control names the network it will switch to and does the switch itself.
  it("offers the network switch on the wrong chain", async () => {
    const user = userEvent.setup();
    const switchNetwork = vi.fn();
    render(<ConnectWallet wallet={wallet("wrong-network", { switchNetwork })} />);

    const button = screen.getByRole("button", { name: /^Switch to / });
    await user.click(button);

    expect(switchNetwork).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the truncated account and links to the profile once connected", () => {
    render(<ConnectWallet wallet={wallet("connected")} />);

    expect(screen.getByRole("link", { name: /0x1234…5678/ })).toHaveAttribute(
      "href",
      "/profile/me"
    );
  });

  // A connected session whose address has not arrived yet still needs a usable
  // link rather than an empty one.
  it("falls back to a generic label when the address is missing", () => {
    render(<ConnectWallet wallet={wallet("connected", { address: undefined })} />);

    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
  });

  it("disconnects from the icon control", async () => {
    const user = userEvent.setup();
    const disconnect = vi.fn();
    render(<ConnectWallet wallet={wallet("connected", { disconnect })} />);

    await user.click(screen.getByRole("button", { name: "Disconnect wallet" }));

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
