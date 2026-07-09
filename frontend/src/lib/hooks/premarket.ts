"use client";

import { useSignTypedData, useWriteContract } from "wagmi";
import { campaignContract } from "../contracts";
import { activeChain } from "../config";

type Addr = `0x${string}`;

/** Off-chain signable order. `isSell`: maker sells cohort shares for USDC; else maker buys. */
export interface Order {
  maker: Addr;
  isSell: boolean;
  cohortId: bigint;
  shareAmount: bigint;
  usdcAmount: bigint; // total USDC for the full shareAmount
  nonce: bigint;
  deadline: bigint; // unix seconds
}

// Must match CampaignV3's ORDER_TYPEHASH field order exactly.
const ORDER_TYPES = {
  Order: [
    { name: "maker", type: "address" },
    { name: "isSell", type: "bool" },
    { name: "cohortId", type: "uint256" },
    { name: "shareAmount", type: "uint256" },
    { name: "usdcAmount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * Premarket: EIP-712 order signing (gasless) + on-chain settlement.
 * The signed order is stored off-chain (backend order book); `fillOrder` settles it on-chain.
 * The EIP-712 domain is per-campaign (verifyingContract = the clone), matching the contract's
 * `DOMAIN_SEPARATOR` — a signature for one campaign/chain cannot be replayed on another.
 */
export function usePremarket(campaign: Addr) {
  const { signTypedDataAsync, ...sign } = useSignTypedData();
  const { writeContractAsync, ...write } = useWriteContract();
  const c = campaignContract(campaign);

  const domain = {
    name: "CampaignV3",
    version: "1",
    chainId: activeChain.id,
    verifyingContract: campaign,
  } as const;

  return {
    sign,
    write,
    /** Sign an order off-chain. Returns the 65-byte signature to store in the order book. */
    signOrder: (order: Order) =>
      signTypedDataAsync({ domain, types: ORDER_TYPES, primaryType: "Order", message: order }),
    /** Taker fills (part of) a maker's signed order. */
    fillOrder: (order: Order, signature: Addr, fillShares: bigint) =>
      writeContractAsync({ ...c, functionName: "fillOrder", args: [order, signature, fillShares], chainId: activeChain.id }),
    /** Maker cancels a specific order by its exact fields. */
    cancelOrder: (order: Order) =>
      writeContractAsync({ ...c, functionName: "cancelOrder", args: [order], chainId: activeChain.id }),
    /** Maker bulk-cancels every order with nonce < `nonce`. */
    invalidateOrdersBelow: (nonce: bigint) =>
      writeContractAsync({ ...c, functionName: "invalidateOrdersBelow", args: [nonce], chainId: activeChain.id }),
  };
}
