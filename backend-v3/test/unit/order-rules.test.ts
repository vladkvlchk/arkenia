import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/domain/errors.js";
import {
  assertCanonicalSignature,
  assertSubmittable,
  isLive,
  remainingShares,
} from "../../src/domain/order-rules.js";
import type { OrderIntent, StoredOrder } from "../../src/domain/types.js";
import {
  ORDER_TYPES,
  orderDomain,
  ViemOrderSignatureVerifier,
} from "../../src/infrastructure/chain/verifiers.js";

const CAMPAIGN = "0x00000000000000000000000000000000000000cc" as const;
const maker = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);

const intent = (over: Partial<OrderIntent> = {}): OrderIntent => ({
  maker: maker.address.toLowerCase() as `0x${string}`,
  isSell: true,
  cohortId: 1n,
  shareAmount: 1_000_000n,
  usdcAmount: 1_200_000n,
  nonce: 0n,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  ...over,
});

const ctx = (over: Partial<Parameters<typeof assertSubmittable>[2]> = {}) => ({
  currentCohort: 3,
  minValidNonce: 0n,
  existingOrderHashes: new Set<string>(),
  openNoncesForMaker: new Set<bigint>(),
  now: new Date(),
  ...over,
});

const code = (fn: () => void): string => {
  try {
    fn();
    return "none";
  } catch (e) {
    return e instanceof DomainError ? e.code : "unexpected";
  }
};

describe("assertSubmittable", () => {
  it("accepts a well-formed order", () => {
    expect(code(() => assertSubmittable(intent(), "0xhash", ctx()))).toBe("none");
  });

  it("rejects what fillOrder would reject", () => {
    expect(code(() => assertSubmittable(intent({ shareAmount: 0n }), "0x1", ctx()))).toBe("invalid_amount");
    expect(code(() => assertSubmittable(intent({ usdcAmount: 0n }), "0x1", ctx()))).toBe("invalid_amount");
    expect(code(() => assertSubmittable(intent({ cohortId: 0n }), "0x1", ctx()))).toBe("unknown_cohort");
    expect(code(() => assertSubmittable(intent({ cohortId: 4n }), "0x1", ctx()))).toBe("unknown_cohort");
    expect(code(() => assertSubmittable(intent({ deadline: 1n }), "0x1", ctx()))).toBe("order_expired");
    expect(
      code(() => assertSubmittable(intent({ nonce: 1n }), "0x1", ctx({ minValidNonce: 2n })))
    ).toBe("nonce_invalidated");
  });

  it("rejects duplicates by hash and by open nonce", () => {
    expect(
      code(() => assertSubmittable(intent(), "0xAB", ctx({ existingOrderHashes: new Set(["0xab"]) })))
    ).toBe("duplicate_order");
    expect(
      code(() => assertSubmittable(intent({ nonce: 7n }), "0x1", ctx({ openNoncesForMaker: new Set([7n]) })))
    ).toBe("duplicate_nonce");
  });
});

describe("assertCanonicalSignature", () => {
  it("accepts a real 65-byte low-s signature", async () => {
    const signature = await maker.signTypedData({
      domain: orderDomain(31337, CAMPAIGN),
      types: ORDER_TYPES,
      primaryType: "Order",
      message: intent(),
    });
    expect(() => assertCanonicalSignature(signature)).not.toThrow();
  });

  it("rejects malformed shapes the contract would reject", () => {
    expect(code(() => assertCanonicalSignature("0x1234"))).toBe("invalid_signature"); // wrong length
    const high_s = `0x${"11".repeat(32)}${"ff".repeat(32)}1b`; // s > half order
    expect(code(() => assertCanonicalSignature(high_s))).toBe("invalid_signature");
    const bad_v = `0x${"11".repeat(32)}${"22".repeat(32)}00`; // v = 0
    expect(code(() => assertCanonicalSignature(bad_v))).toBe("invalid_signature");
  });
});

describe("ViemOrderSignatureVerifier", () => {
  const verifier = new ViemOrderSignatureVerifier(31337);

  it("verifies the maker's signature and rejects tampering", async () => {
    const order = intent();
    const signature = (await maker.signTypedData({
      domain: orderDomain(31337, CAMPAIGN),
      types: ORDER_TYPES,
      primaryType: "Order",
      message: order,
    })) as `0x${string}`;

    expect(await verifier.verifyOrder(CAMPAIGN, order, signature)).toBe(true);
    // different price → different digest → recovery mismatch
    expect(await verifier.verifyOrder(CAMPAIGN, { ...order, usdcAmount: 2_000_000n }, signature)).toBe(false);
    // same order signed for another campaign must not verify here
    expect(
      await verifier.verifyOrder("0x00000000000000000000000000000000000000dd", order, signature)
    ).toBe(false);
  });

  it("hashOrder is deterministic and campaign-scoped", () => {
    const order = intent();
    expect(verifier.hashOrder(CAMPAIGN, order)).toBe(verifier.hashOrder(CAMPAIGN, order));
    expect(verifier.hashOrder(CAMPAIGN, order)).not.toBe(
      verifier.hashOrder("0x00000000000000000000000000000000000000dd", order)
    );
  });
});

describe("book liveness", () => {
  const stored = (over: Partial<StoredOrder> = {}): StoredOrder => ({
    ...intent(),
    orderHash: "0x01",
    campaign: CAMPAIGN,
    signature: "0x",
    status: "open",
    filledShares: 0n,
    createdAt: new Date(),
    ...over,
  });

  it("tracks remaining and liveness through fills/expiry", () => {
    expect(remainingShares(stored())).toBe(1_000_000n);
    expect(remainingShares(stored({ filledShares: 400_000n }))).toBe(600_000n);
    expect(isLive(stored(), new Date())).toBe(true);
    expect(isLive(stored({ filledShares: 1_000_000n }), new Date())).toBe(false);
    expect(isLive(stored({ status: "cancelled" }), new Date())).toBe(false);
    expect(isLive(stored({ deadline: 1n }), new Date())).toBe(false);
  });
});
