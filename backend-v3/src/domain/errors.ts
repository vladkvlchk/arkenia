export type DomainErrorCode =
  | "invalid_maker"
  | "invalid_amount"
  | "unknown_cohort"
  | "unknown_campaign"
  | "order_expired"
  | "nonce_invalidated"
  | "duplicate_order"
  | "duplicate_nonce"
  | "invalid_signature"
  | "not_angel"
  | "stale_auth"
  | "invalid_metadata"
  | "cover_too_large"
  | "unsupported_cover_type"
  | "storage_unconfigured";

/** Business-rule violation; the HTTP layer maps codes to status codes. */
export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DomainError";
  }
}
