/**
 * Full indexer pass over a scripted campaign lifecycle (PGlite + real stores),
 * with hand-computed expected aggregates and an idempotent-replay assertion.
 *
 * Scenario (6-decimal units, RAY fractions):
 *   b1  CampaignCreated
 *   b2  A deposits 1 000; B deposits 3 000            → pool 4 000
 *   b3  angel withdraws 400 (10%) → cohort 1           → pool 3 600
 *   b4  A touches → Settled(A,1): 100 → c1; deposits 100 → pool 3 700, A bal 1 000
 *   b5  angel returns 40 to c1                         → acc 0.1/share
 *   b6  A claims 10 (100/400 of 40)
 *   b7  A transfers 40 c1-shares to CU (Settled(CU,1) first)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChainSync } from "../../src/application/chain-sync.js";
import { RAY } from "../../src/domain/constants.js";
import type { StoredOrder } from "../../src/domain/types.js";
import type { DbHandle } from "../../src/infrastructure/db/client.js";
import { DrizzleOrderStore } from "../../src/infrastructure/db/stores/order-store.js";
import {
  DrizzleProjectionStore,
  DrizzleUnitOfWork,
} from "../../src/infrastructure/db/stores/projection-store.js";
import { createTestDb } from "../helpers/db.js";
import { addr, CHAIN_ID, EventScript, FakeChainSource, USDC } from "../helpers/fake-chain.js";

const CAMPAIGN = addr(0xc0);
const ANGEL = addr(0xa0);
const TOKEN = addr(0x70);
const A = addr(0xaa);
const B = addr(0xbb);
const CU = addr(0xcd);

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function lifecycleScript(): EventScript {
  const s = new EventScript();
  s.nextBlock().emit({ name: "CampaignCreated", campaign: CAMPAIGN, angel: ANGEL, token: TOKEN });
  s.nextBlock()
    .emit({ name: "Deposited", campaign: CAMPAIGN, believer: A, amount: 1000n * USDC })
    .emit({ name: "Deposited", campaign: CAMPAIGN, believer: B, amount: 3000n * USDC });
  s.nextBlock().emit({
    name: "Withdrawn",
    campaign: CAMPAIGN,
    cohortId: 1n,
    amount: 400n * USDC,
    fractionRay: RAY / 10n,
  });
  s.nextBlock()
    .emit({ name: "Settled", campaign: CAMPAIGN, user: A, uptoCohort: 1n })
    .emit({ name: "Deposited", campaign: CAMPAIGN, believer: A, amount: 100n * USDC });
  s.nextBlock().emit({ name: "FundsReturned", campaign: CAMPAIGN, cohortId: 1n, amount: 40n * USDC });
  s.nextBlock().emit({ name: "Claimed", campaign: CAMPAIGN, believer: A, amount: 10n * USDC });
  s.nextBlock()
    .emit({ name: "Settled", campaign: CAMPAIGN, user: CU, uptoCohort: 1n })
    .emit({
      name: "SharesTransferred",
      campaign: CAMPAIGN,
      cohortId: 1n,
      from: A,
      to: CU,
      amount: 40n * USDC,
    });
  return s;
}

async function syncAll(sync: ChainSync): Promise<void> {
  while ((await sync.runOnce()) !== null) {
    /* drain */
  }
}

describe("indexer lifecycle projection", () => {
  let db: DbHandle;
  let close: () => Promise<void>;
  let store: DrizzleProjectionStore;
  let sync: ChainSync;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    store = new DrizzleProjectionStore(db);
    const script = lifecycleScript();
    sync = new ChainSync(
      new FakeChainSource(script.events, script.headBlock, addr(0xfa)),
      new DrizzleUnitOfWork(db),
      { chainId: CHAIN_ID, factoryAddress: addr(0xfa), confirmations: 0, blockRange: 3, startBlock: 1n },
      silent
    );
    await syncAll(sync);
  });

  afterAll(() => close());

  it("mirrors the campaign's global counters", async () => {
    const c = await store.getCampaign(CAMPAIGN);
    expect(c).not.toBeNull();
    expect(c!.poolTotal).toBe(3700n * USDC);
    expect(c!.totalShares).toBe(400n * USDC);
    expect(c!.currentCohort).toBe(1);
    expect(c!.rewardReserves).toBe(30n * USDC); // 40 returned − 10 claimed
    expect(c!.lifetimeDeposited).toBe(4100n * USDC);
    expect(c!.lifetimeReturned).toBe(40n * USDC);
    expect(c!.believers).toBe(3); // A, B, CU
  });

  it("mirrors the cohort accumulator state", async () => {
    const cohort = await store.getCohort(CAMPAIGN, 1);
    expect(cohort!.fractionRay).toBe(RAY / 10n);
    expect(cohort!.totalShares).toBe(400n * USDC);
    expect(cohort!.accRay).toBe(RAY / 10n); // 40 / 400 per share
    expect(cohort!.returned).toBe(40n * USDC);
  });

  it("mirrors per-account settlement state exactly", async () => {
    const a = await store.getPosition(CAMPAIGN, A);
    expect(a!.poolBalance).toBe(1000n * USDC); // 900 after settle + 100 re-deposit
    expect(a!.settledUpTo).toBe(1);
    expect(a!.accruedReward).toBe(0n); // claimed in full

    const aShare = await store.getShare(CAMPAIGN, 1, A);
    expect(aShare!.shares).toBe(60n * USDC); // 100 − 40 transferred
    expect(aShare!.rewardDebt).toBe(6n * USDC); // resynced at acc 0.1

    const cuShare = await store.getShare(CAMPAIGN, 1, CU);
    expect(cuShare!.shares).toBe(40n * USDC);
    expect(cuShare!.rewardDebt).toBe(4n * USDC);

    const b = await store.getPosition(CAMPAIGN, B);
    expect(b!.poolBalance).toBe(3000n * USDC); // raw mirror — B never settled
    expect(b!.settledUpTo).toBe(0);
  });

  it("writes the UI-facing activity log (no entries for settle/transfer plumbing)", async () => {
    const rows = await db.query.activity.findMany();
    const types = rows.map((r) => r.type).sort();
    expect(types).toEqual(["claim", "deposit", "deposit", "deposit", "return", "withdraw"]);
  });

  it("replays idempotently — a cursor reset changes nothing", async () => {
    await new DrizzleUnitOfWork(db).withTransaction((s) => s.setCursor(CHAIN_ID, 0n));
    await syncAll(sync);
    const c = await store.getCampaign(CAMPAIGN);
    expect(c!.lifetimeDeposited).toBe(4100n * USDC);
    expect(c!.believers).toBe(3);
    expect(c!.poolTotal).toBe(3700n * USDC);
    const aShare = await store.getShare(CAMPAIGN, 1, A);
    expect(aShare!.shares).toBe(60n * USDC);
  });
});

describe("premarket event projection", () => {
  it("applies fills, cancels and bulk invalidation to stored orders", async () => {
    const { db, close } = await createTestDb();
    try {
      const orders = new DrizzleOrderStore(db);
      const base: StoredOrder = {
        orderHash: "0x01",
        campaign: CAMPAIGN,
        maker: A,
        isSell: true,
        cohortId: 1n,
        shareAmount: 100n * USDC,
        usdcAmount: 120n * USDC,
        nonce: 5n,
        deadline: 9999999999n,
        signature: "0xff",
        status: "open",
        filledShares: 0n,
        createdAt: new Date(),
      };
      await orders.insertOrder(base);
      await orders.insertOrder({ ...base, orderHash: "0x02", nonce: 3n });

      const s = new EventScript();
      s.nextBlock().emit({ name: "CampaignCreated", campaign: CAMPAIGN, angel: ANGEL, token: TOKEN });
      s.nextBlock().emit({
        name: "OrderFilled",
        campaign: CAMPAIGN,
        orderHash: "0x01",
        maker: A,
        taker: B,
        cohortId: 1n,
        shares: 40n * USDC,
        usdc: 48n * USDC,
        makerIsSeller: true,
      });
      s.nextBlock().emit({ name: "OrdersInvalidated", campaign: CAMPAIGN, maker: A, minValidNonce: 4n });

      const sync = new ChainSync(
        new FakeChainSource(s.events, s.headBlock, addr(0xfa)),
        new DrizzleUnitOfWork(db),
        { chainId: CHAIN_ID, factoryAddress: addr(0xfa), confirmations: 0, blockRange: 10, startBlock: 1n },
        silent
      );
      while ((await sync.runOnce()) !== null) {/* drain */}

      const store = new DrizzleProjectionStore(db);
      const filled = await store.getOrderByHash(CAMPAIGN, "0x01");
      expect(filled!.filledShares).toBe(40n * USDC);
      expect(filled!.status).toBe("open"); // partial

      const invalidated = await store.getOrderByHash(CAMPAIGN, "0x02");
      expect(invalidated!.status).toBe("invalidated"); // nonce 3 < 4

      const trades = await orders.listTrades(CAMPAIGN, 1, 10);
      expect(trades).toHaveLength(1);
      expect(trades[0]!.usdc).toBe(48n * USDC);

      expect(await orders.getMinValidNonce(CAMPAIGN, A)).toBe(4n);
    } finally {
      await close();
    }
  });
});
