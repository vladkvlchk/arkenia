import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletProvider, useWallet } from "./mock-wallet";

/**
 * Every wallet-aware surface in the app renders off this one status, so the
 * order the conditions are checked in is the whole contract. The dangerous
 * mistake is reporting "connected" while the wallet sits on another chain:
 * signing then succeeds and the transaction lands somewhere the campaign
 * address means something else, or nothing at all.
 */
const { usePrivy, useAccount, useChainId, useSwitchChain, useReadContract, login, logout, switchChain } =
  vi.hoisted(() => ({
    usePrivy: vi.fn(),
    useAccount: vi.fn(),
    useChainId: vi.fn(),
    useSwitchChain: vi.fn(),
    useReadContract: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    switchChain: vi.fn(),
  }));

vi.mock("@privy-io/react-auth", () => ({ usePrivy }));
vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useAccount,
  useChainId,
  useSwitchChain,
  useReadContract,
}));

const { activeChain } = await import("@/lib/config");
const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as const;

function renderWallet() {
  return renderHook(() => useWallet(), {
    wrapper: ({ children }) => <WalletProvider>{children}</WalletProvider>,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  usePrivy.mockReturnValue({ ready: true, authenticated: true, login, logout });
  useAccount.mockReturnValue({ address: ADDRESS, isConnected: true });
  useChainId.mockReturnValue(activeChain.id);
  useSwitchChain.mockReturnValue({ switchChain });
  useReadContract.mockReturnValue({ data: undefined });
});

describe("WalletProvider status", () => {
  it("reports connected on the configured chain", () => {
    const { result } = renderWallet();

    expect(result.current.status).toBe("connected");
    expect(result.current.address).toBe(ADDRESS);
  });

  // Privy resolves its session asynchronously; before it does, the app knows
  // nothing — reporting "disconnected" would flash a connect button at a user
  // who is already signed in.
  it("reports connecting until the session has resolved", () => {
    usePrivy.mockReturnValue({ ready: false, authenticated: false, login, logout });

    expect(renderWallet().result.current.status).toBe("connecting");
  });

  it("reports disconnected when the session is not authenticated", () => {
    usePrivy.mockReturnValue({ ready: true, authenticated: false, login, logout });

    expect(renderWallet().result.current.status).toBe("disconnected");
  });

  // An authenticated Privy session does not guarantee a connected EOA — the two
  // can drift apart when a wallet is removed from the browser.
  it("reports disconnected when no wallet is attached to the session", () => {
    useAccount.mockReturnValue({ address: undefined, isConnected: false });

    expect(renderWallet().result.current.status).toBe("disconnected");
  });

  /**
   * The chain check comes last, after authentication is established. Checking
   * it earlier would report "wrong-network" to someone who has not connected
   * anything at all.
   */
  it("reports wrong-network for a connected wallet on another chain", () => {
    useChainId.mockReturnValue(activeChain.id + 1);

    expect(renderWallet().result.current.status).toBe("wrong-network");
  });

  it("keeps the address available while on the wrong chain", () => {
    useChainId.mockReturnValue(activeChain.id + 1);

    expect(renderWallet().result.current.address).toBe(ADDRESS);
  });
});

describe("WalletProvider balance", () => {
  it("converts the raw balance out of base units", () => {
    useReadContract.mockReturnValue({ data: 1_250_500_000n });

    expect(renderWallet().result.current.tokenBalance).toBe(1250.5);
  });

  // Undefined is not zero: a balance that has not loaded must not be rendered
  // as an empty wallet, or a deposit form would reject every amount.
  it("leaves the balance undefined until the read resolves", () => {
    useReadContract.mockReturnValue({ data: undefined });

    expect(renderWallet().result.current.tokenBalance).toBeUndefined();
  });

  it("reports a genuinely empty balance as zero", () => {
    useReadContract.mockReturnValue({ data: 0n });

    expect(renderWallet().result.current.tokenBalance).toBe(0);
  });
});

describe("WalletProvider actions", () => {
  it("delegates connect and disconnect to the session", () => {
    const { result } = renderWallet();

    result.current.connect();
    result.current.disconnect();

    expect(login).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("switches to the configured chain, not merely away from the current one", () => {
    useChainId.mockReturnValue(activeChain.id + 1);
    const { result } = renderWallet();

    result.current.switchNetwork();

    expect(switchChain).toHaveBeenCalledWith({ chainId: activeChain.id });
  });
});

describe("useWallet", () => {
  // Without the guard the hook returns null and every consumer crashes on
  // property access, far from the missing provider that caused it.
  it("refuses to run outside a provider", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useWallet())).toThrow(/must be used within WalletProvider/);

    error.mockRestore();
  });
});
