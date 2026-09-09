import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeChain } from "@/lib/config";
import { campaignV3Abi } from "@/lib/abi/campaignV3";
import { usePremarket, type Order } from "./premarket";

/**
 * The EIP-712 payload is the single hardest thing in this app to debug from the
 * outside: a wrong domain or a reordered field produces a perfectly valid
 * signature for a different message, so the contract recovers a different
 * signer and rejects the order with no clue as to why. Pinning it here turns
 * that class of failure into a red test.
 */
const { signTypedDataAsync, writeContractAsync } = vi.hoisted(() => ({
  signTypedDataAsync: vi.fn(),
  writeContractAsync: vi.fn(),
}));

vi.mock("wagmi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("wagmi")>()),
  useSignTypedData: () => ({ signTypedDataAsync }),
  useWriteContract: () => ({ writeContractAsync }),
}));

const CAMPAIGN = "0xcE9ce282137528c916A15Ad5542403bfF51845ca" as const;
const MAKER = "0x1234567890abcdef1234567890abcdef12345678" as const;

const order: Order = {
  maker: MAKER,
  isSell: true,
  cohortId: 2n,
  shareAmount: 100_000_000n,
  usdcAmount: 150_000_000n,
  nonce: 42n,
  deadline: 1_788_000_000n,
};

function renderPremarket() {
  return renderHook(() => usePremarket(CAMPAIGN)).result;
}

beforeEach(() => {
  vi.clearAllMocks();
  signTypedDataAsync.mockResolvedValue("0xsignature");
  writeContractAsync.mockResolvedValue("0xtx");
});

describe("usePremarket signing domain", () => {
  /**
   * verifyingContract is the campaign clone, not the factory, and chainId is
   * the configured chain. Together they are what stops a signature from being
   * replayed against another campaign or another network.
   */
  it("binds the signature to this campaign on this chain", async () => {
    await renderPremarket().current.signOrder(order);

    expect(signTypedDataAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: {
          name: "CampaignV3",
          version: "1",
          chainId: activeChain.id,
          verifyingContract: CAMPAIGN,
        },
      })
    );
  });

  /**
   * The type hash is built from the field order, so this list has to match the
   * contract's ORDER_TYPEHASH exactly — reordering two fields of the same type
   * would still compile, still sign, and never verify.
   */
  it("declares the order fields in the contract's order", async () => {
    await renderPremarket().current.signOrder(order);

    const { types, primaryType } = signTypedDataAsync.mock.calls[0][0];
    expect(primaryType).toBe("Order");
    expect(types.Order).toEqual([
      { name: "maker", type: "address" },
      { name: "isSell", type: "bool" },
      { name: "cohortId", type: "uint256" },
      { name: "shareAmount", type: "uint256" },
      { name: "usdcAmount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ]);
  });

  // The struct signed has to be the struct the caller passed — no defaults, no
  // coercion between the ticket and the wallet prompt.
  it("signs the struct it was handed, unchanged", async () => {
    await renderPremarket().current.signOrder(order);

    expect(signTypedDataAsync.mock.calls[0][0].message).toEqual(order);
  });

  it("returns the signature to the caller", async () => {
    await expect(renderPremarket().current.signOrder(order)).resolves.toBe("0xsignature");
  });
});

describe("usePremarket settlement", () => {
  // Every write is pinned to the configured chain so the wallet is forced to
  // switch rather than quietly transacting on whatever it happens to be on.
  it.each([
    ["fillOrder", (p: ReturnType<typeof renderPremarket>["current"]) => p.fillOrder(order, "0xsig", 10n)],
    ["cancelOrder", (p: ReturnType<typeof renderPremarket>["current"]) => p.cancelOrder(order)],
    ["invalidateOrdersBelow", (p: ReturnType<typeof renderPremarket>["current"]) => p.invalidateOrdersBelow(50n)],
  ])("pins %s to the configured chain and campaign", async (functionName, call) => {
    await call(renderPremarket().current);

    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: CAMPAIGN,
        abi: campaignV3Abi,
        functionName,
        chainId: activeChain.id,
      })
    );
  });

  it("passes the fill size alongside the order and its signature", async () => {
    await renderPremarket().current.fillOrder(order, "0xsig", 10_000_000n);

    expect(writeContractAsync.mock.calls[0][0].args).toEqual([order, "0xsig", 10_000_000n]);
  });

  // A bulk cancel invalidates every nonce below the given one; passing the
  // wrong bound either leaves orders live or kills orders the maker wanted.
  it("bulk-cancels by nonce bound", async () => {
    await renderPremarket().current.invalidateOrdersBelow(50n);

    expect(writeContractAsync.mock.calls[0][0].args).toEqual([50n]);
  });
});
