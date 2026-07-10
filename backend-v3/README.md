# Arkenia V3 backend

Indexer + API for **CampaignV3** (pool → cohorts → premarket). Three concerns, one service:

1. **Indexer** (separate worker process) — replays factory + campaign events into Postgres
   projections: campaign aggregates, cohorts, per-account positions, activity log, premarket
   fills. Resumable, idempotent, re-org-buffered.
2. **Order store** — the premarket is signature-based; signed EIP-712 orders are stored
   off-chain here (intents only, never funds) and served as an order book. Fills/cancels
   flow back from chain events.
3. **Metadata API** — campaign name/description/cover live off-chain; writes are gated by
   an angel signature; covers upload to Cloudflare R2.

Fully env-driven: the same build serves Base Sepolia today and Base mainnet later —
nothing in the code branches on environment.

The V1 backend (`backend/`, live on mainnet) is untouched; this service is independent
(own package, own DB, own pm2 processes) per the planned testnet stack.

## Run

```bash
cd backend-v3
npm install
cp .env.example .env          # fill DATABASE_URL, RPC_URL, factory, R2 (optional)
npm run migrate               # apply SQL migrations (drizzle/)
npm run dev:api               # API on :3002 (tsx watch)
npm run dev:indexer           # indexer worker
```

Production (pm2, from `backend-v3/`):

```bash
npm run build && npm run migrate
pm2 start ecosystem.config.cjs     # arkenia-v3-api + arkenia-v3-indexer
```

Other commands: `npm test` (unit + integration, hermetic — PGlite, no external DB),
`npm run typecheck`, `npm run generate` (new migration from schema changes),
`npm run reindex` (wipe chain projections and replay from the deploy block — stop the
indexer first; signed orders and metadata are preserved).

## Architecture (clean, dependency-inverted)

```
src/
  domain/          pure types + math, no imports from other layers
    projection.ts    exact replay of the contract's lazy settlement (RAY flooring,
                     settle checkpoints, reward debt, claim clamps)
    order-rules.ts   fillOrder's pure predicates applied at submission time
  application/     use cases + ports (interfaces the outer layers implement)
    chain-sync.ts    the indexer: pull logs → project → persist, one tx per batch
    orders.ts        submit-order validation pipeline, order-book assembly
    metadata.ts      angel-signature-gated metadata writes
    queries.ts       read-side composition (settle-aware views)
  infrastructure/  Drizzle/Postgres stores, viem chain source + verifiers, R2, config
  presentation/    Fastify server + DTO mappers (bigint → display numbers happens here)
  app/container.ts composition root; entry/{api,indexer,reindex}.ts entrypoints
```

**Indexer correctness.** CampaignV3 settles believers lazily — a withdrawal stores one
fraction and shares materialise per-user on their next touch (`Settled` events). The
projector replays that math bit-exact in bigint (Solidity-identical flooring), so DB
positions mirror on-chain state. Idempotency: every event is journaled by
`(chainId, txHash, logIndex)`; an already-seen event is never re-applied, so restarts and
overlapping ranges are safe. One batch = one DB transaction = events + aggregates +
cursor. Re-orgs: only blocks ≥ `CONFIRMATIONS` behind head are indexed; deeper re-orgs →
`npm run reindex`.

**Numbers match the UI.** DTO derivations follow `frontend/src/lib/hooks/campaign-data.ts`:
`totalDeposited = poolBalance + totalWithdrawn`, `totalWithdrawn = totalShares`, status =
`open` until the first cohort, then `returning`. The indexer upgrades what the UI marked
as TODO: real `totalReturned` (lifetime Σ returns), real `believers` (accounts holding
pool balance or shares), real `createdAt` / cohort `formedAt` (block timestamps).

## REST (versioned under `/api/v3`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v3/health` | `{ ok, chainId, lastIndexedBlock }` |
| GET | `/api/v3/campaigns` | `{ campaigns: Campaign[] }` — frontend `Campaign` shape |
| GET | `/api/v3/campaigns/:address?account=0x…` | `{ campaign, cohorts }`; `account` fills `yourShares`/`yourClaimable` |
| GET | `/api/v3/campaigns/:address/activity?limit=` | `{ activity: ActivityItem[] }` |
| GET | `/api/v3/accounts/:address/positions` | refundable / per-cohort shares / claimable per campaign |
| GET | `/api/v3/accounts/:address/activity?limit=` | account-wide activity |
| GET | `/api/v3/campaigns/:address/orders?cohort=` | `{ book: {bids,asks,lastPrice}, orders, trades }` |
| POST | `/api/v3/campaigns/:address/orders` | submit a signed order (below) |
| GET | `/api/v3/campaigns/:address/metadata` | stored or derived-fallback metadata |
| PUT | `/api/v3/campaigns/:address/metadata` | angel-signed update (below) |

Errors: `{ error: { code, message } }` — e.g. `unknown_campaign` 404, `invalid_signature`
401, `duplicate_nonce` 409, `not_angel` 403, `stale_auth` 401.

### POST an order

```jsonc
{
  "order": {
    "maker": "0x…", "isSell": true,
    "cohortId": "1", "shareAmount": "1000000", "usdcAmount": "1200000",
    "nonce": "0", "deadline": "1760000000"          // uint256s as decimal strings
  },
  "signature": "0x…"                                 // 65-byte EIP-712 signature
}
```

Domain `{ name: "CampaignV3", version: "1", chainId, verifyingContract: campaign }` —
exactly what `frontend/src/lib/hooks/premarket.ts` signs. Rejected: bad/high-s signature,
expired deadline, unknown cohort, nonce below the maker's on-chain `minValidNonce`,
duplicate order hash, duplicate open nonce. Each served order carries `fill.order` +
`fill.signature` ready for `fillOrder`.

### PUT metadata (angel-signed)

The angel personal-signs (EIP-191) this exact message:

```
Arkenia campaign metadata
chainId: <CHAIN_ID>
campaign: <lowercase address>
name: <name>
description: <description>
issuedAt: <ISO-8601, same string as the field>
```

Send JSON `{ name, description, issuedAt, signature }` or `multipart/form-data` with the
same fields plus an optional `cover` file (png/jpeg/webp ≤ `MAX_COVER_BYTES`). `issuedAt`
must be within ±10 min of server time and newer than the previous accepted update
(anti-replay). The signer must be the campaign's on-chain `angel`.

## Env

See `.env.example`. Required: `CHAIN_ID`, `RPC_URL`, `FACTORY_ADDRESS`, `DATABASE_URL`.
Optional: `START_BLOCK` (auto-discovered via binary search on `eth_getCode` when unset),
`PORT` (3002), `CONFIRMATIONS`, `LOG_BLOCK_RANGE`, `POLL_INTERVAL_MS`, `CORS_ORIGIN`,
`TOKEN_DECIMALS`, `R2_*` (cover upload disabled when unset), `MAX_COVER_BYTES`, `LOG_LEVEL`.

## Tests

- **Unit** — the projection math against hand-computed contract scenarios (settle
  flooring, share transfers realize/resync, claim clamps, uniform-return birth offsets)
  and order rules with real viem-signed typed data.
- **Integration** — PGlite (in-process Postgres): full indexer batches through a fake
  chain source with idempotent replay assertions, and the whole HTTP surface via
  `fastify.inject`, including a real signed order round-trip and an angel-signed
  metadata update.

`npm test` needs no network and no local Postgres.
