/**
 * Signature verification over viem — pure crypto, no RPC round-trips.
 * The EIP-712 domain matches CampaignV3.initialize exactly:
 * name "CampaignV3", version "1", chainId, verifyingContract = the clone.
 */

import { getAddress, hashTypedData, recoverMessageAddress, recoverTypedDataAddress } from "viem";
import type { OrderSignatureVerifier, PersonalSignVerifier } from "../../application/ports.js";
import type { Address, Hex, OrderIntent } from "../../domain/types.js";

/** Must match the contract's ORDER_TYPEHASH field order exactly. */
export const ORDER_TYPES = {
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

export function orderDomain(chainId: number, campaign: Address) {
  return {
    name: "CampaignV3",
    version: "1",
    chainId,
    verifyingContract: getAddress(campaign),
  } as const;
}

export class ViemOrderSignatureVerifier implements OrderSignatureVerifier {
  constructor(private readonly chainId: number) {}

  hashOrder(campaign: Address, order: OrderIntent): Hex {
    return hashTypedData({
      domain: orderDomain(this.chainId, campaign),
      types: ORDER_TYPES,
      primaryType: "Order",
      message: { ...order, maker: getAddress(order.maker) },
    }).toLowerCase() as Hex;
  }

  async verifyOrder(campaign: Address, order: OrderIntent, signature: Hex): Promise<boolean> {
    try {
      const recovered = await recoverTypedDataAddress({
        domain: orderDomain(this.chainId, campaign),
        types: ORDER_TYPES,
        primaryType: "Order",
        message: { ...order, maker: getAddress(order.maker) },
        signature,
      });
      return recovered.toLowerCase() === order.maker.toLowerCase();
    } catch {
      return false;
    }
  }
}

export class ViemPersonalSignVerifier implements PersonalSignVerifier {
  async recover(message: string, signature: Hex): Promise<Address | null> {
    try {
      const recovered = await recoverMessageAddress({ message, signature });
      return recovered.toLowerCase() as Address;
    } catch {
      return null;
    }
  }
}
