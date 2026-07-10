/**
 * Premarket order rules — the pure subset of what `fillOrder` will enforce
 * on-chain, applied at submission time so the book never serves dead intents.
 */

import { SECP256K1_HALF_N } from "./constants.js";
import { DomainError } from "./errors.js";
import type { OrderIntent, StoredOrder } from "./types.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface OrderContext {
  /** Head cohort of the campaign (orders reference existing cohorts only). */
  currentCohort: number;
  /** Contract `minValidNonce[maker]` mirror — orders below are bulk-cancelled. */
  minValidNonce: bigint;
  /** Same-maker open orders (duplicate-nonce / duplicate-hash checks). */
  existingOrderHashes: Set<string>;
  openNoncesForMaker: Set<bigint>;
  now: Date;
}

/** Structural + liveness checks. Throws DomainError with a machine-readable code. */
export function assertSubmittable(order: OrderIntent, orderHash: string, ctx: OrderContext): void {
  if (order.maker.toLowerCase() === ZERO_ADDRESS) {
    throw new DomainError("invalid_maker", "maker must not be the zero address");
  }
  if (order.shareAmount <= 0n) {
    throw new DomainError("invalid_amount", "shareAmount must be positive");
  }
  if (order.usdcAmount <= 0n) {
    // A zero-priced order is unfillable on-chain (fillOrder reverts ZeroAmount).
    throw new DomainError("invalid_amount", "usdcAmount must be positive");
  }
  if (order.cohortId < 1n || order.cohortId > BigInt(ctx.currentCohort)) {
    throw new DomainError("unknown_cohort", `cohort ${order.cohortId} does not exist`);
  }
  const nowSec = BigInt(Math.floor(ctx.now.getTime() / 1000));
  if (order.deadline <= nowSec) {
    throw new DomainError("order_expired", "deadline is in the past");
  }
  if (order.nonce < ctx.minValidNonce) {
    throw new DomainError("nonce_invalidated", `nonce below maker's minValidNonce (${ctx.minValidNonce})`);
  }
  if (ctx.existingOrderHashes.has(orderHash.toLowerCase())) {
    throw new DomainError("duplicate_order", "an identical order is already stored");
  }
  if (ctx.openNoncesForMaker.has(order.nonce)) {
    throw new DomainError("duplicate_nonce", "maker already has an open order with this nonce");
  }
}

/**
 * Contract `_validSig` shape checks (65 bytes, low-s, v ∈ {27, 28}) — enforced here
 * so a stored order can never be rejected at fill time for signature shape.
 * Cryptographic recovery itself happens behind the OrderSignatureVerifier port.
 */
export function assertCanonicalSignature(signature: string): void {
  const hex = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== 130) {
    throw new DomainError("invalid_signature", "signature must be 65 bytes of hex");
  }
  const s = BigInt(`0x${hex.slice(64, 128)}`);
  if (s > SECP256K1_HALF_N) {
    throw new DomainError("invalid_signature", "signature s-value must be low-s (EIP-2)");
  }
  const v = parseInt(hex.slice(128, 130), 16);
  if (v !== 27 && v !== 28) {
    throw new DomainError("invalid_signature", "signature v must be 27 or 28");
  }
}

/** Remaining fillable shares of a stored order. */
export function remainingShares(order: StoredOrder): bigint {
  const left = order.shareAmount - order.filledShares;
  return left > 0n ? left : 0n;
}

/** True when a stored order should still be served in the book. */
export function isLive(order: StoredOrder, now: Date): boolean {
  if (order.status !== "open") return false;
  if (remainingShares(order) === 0n) return false;
  return order.deadline > BigInt(Math.floor(now.getTime() / 1000));
}
