"use client";

import { createContext, useContext, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useChainId, useReadContract, useSwitchChain } from "wagmi";
import { formatUnits } from "viem";
import { activeChain } from "@/lib/config";
import { tokenContract } from "@/lib/contracts";

/**
 * Real wallet session, exposed as the WalletView shape the UI already consumes.
 * (Filename kept for import stability; this is no longer a mock.) Backed by Privy for
 * login/logout and wagmi for account/chain/balance.
 */
export type WalletStatus = "disconnected" | "connecting" | "wrong-network" | "connected";

export interface WalletView {
  status: WalletStatus;
  address?: `0x${string}`;
  /** Display balance of the fundraising token, already formatted units. */
  tokenBalance?: number;
  connect: () => void;
  disconnect: () => void;
  switchNetwork: () => void;
}

const WalletContext = createContext<WalletView | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const { data: balance } = useReadContract({
    ...tokenContract,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const value = useMemo<WalletView>(() => {
    let status: WalletStatus;
    if (!ready) status = "connecting";
    else if (!authenticated || !isConnected || !address) status = "disconnected";
    else if (chainId !== activeChain.id) status = "wrong-network";
    else status = "connected";

    return {
      status,
      address,
      tokenBalance: balance !== undefined ? Number(formatUnits(balance as bigint, 6)) : undefined,
      connect: () => login(),
      disconnect: () => logout(),
      switchNetwork: () => switchChain({ chainId: activeChain.id }),
    };
  }, [ready, authenticated, isConnected, address, chainId, balance, login, logout, switchChain]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletView {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
