/**
 * The whole HTTP surface over PGlite: indexed lifecycle → DTO parity with the
 * frontend derivations, a real signed order round-trip, and angel-signed
 * metadata (happy + every rejection path).
 */

import type { FastifyInstance } from "fastify";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChainSync } from "../../src/application/chain-sync.js";
import { GetMetadata, PutMetadata, metadataMessage } from "../../src/application/metadata.js";
import { GetOrderBook, SubmitOrder } from "../../src/application/orders.js";
import { Queries } from "../../src/application/queries.js";
import { RAY } from "../../src/domain/constants.js";
import type { DbHandle } from "../../src/infrastructure/db/client.js";
import {
  ORDER_TYPES,
  orderDomain,
  ViemOrderSignatureVerifier,
  ViemPersonalSignVerifier,
} from "../../src/infrastructure/chain/verifiers.js";
import { DrizzleMetadataStore } from "../../src/infrastructure/db/stores/metadata-store.js";
import { DrizzleOrderStore } from "../../src/infrastructure/db/stores/order-store.js";
import {
  DrizzleProjectionStore,
  DrizzleUnitOfWork,
} from "../../src/infrastructure/db/stores/projection-store.js";
import { DrizzleCampaignQueryStore } from "../../src/infrastructure/db/stores/query-store.js";
import { buildServer } from "../../src/presentation/http/server.js";
import { createTestDb } from "../helpers/db.js";
import { addr, CHAIN_ID, EventScript, FakeChainSource, USDC } from "../helpers/fake-chain.js";

const angel = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);
const maker = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);

const CAMPAIGN = addr(0xc0);
const ANGEL = angel.address.toLowerCase() as `0x${string}`;
const TOKEN = addr(0x70);
const A = addr(0xaa);
const B = addr(0xbb);

const silent = { debug() {}, info() {}, warn() {}, error() {} };

describe("HTTP API", () => {
  let db: DbHandle;
  let close: () => Promise<void>;
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());

    // index the lifecycle: A 1000 + B 3000 → withdraw 400 (c1) → return 40 → A settles
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
    s.nextBlock().emit({ name: "FundsReturned", campaign: CAMPAIGN, cohortId: 1n, amount: 40n * USDC });
    s.nextBlock()
      .emit({ name: "Settled", campaign: CAMPAIGN, user: A, uptoCohort: 1n })
      .emit({ name: "Refunded", campaign: CAMPAIGN, believer: A, amount: 900n * USDC });

    const sync = new ChainSync(
      new FakeChainSource(s.events, s.headBlock),
      new DrizzleUnitOfWork(db),
      { chainId: CHAIN_ID, factoryAddress: addr(0xfa), confirmations: 0, blockRange: 10, startBlock: 1n },
      silent
    );
    while ((await sync.runOnce()) !== null) {/* drain */}

    const queryStore = new DrizzleCampaignQueryStore(db);
    const orderStore = new DrizzleOrderStore(db);
    const metadataStore = new DrizzleMetadataStore(db);
    const projectionStore = new DrizzleProjectionStore(db);
    const verifier = new ViemOrderSignatureVerifier(CHAIN_ID);

    app = buildServer({
      queries: new Queries(queryStore, metadataStore, CHAIN_ID),
      submitOrder: new SubmitOrder(queryStore, orderStore, verifier),
      getOrderBook: new GetOrderBook(queryStore, orderStore),
      putMetadata: new PutMetadata(
        queryStore,
        metadataStore,
        new ViemPersonalSignVerifier(),
        { enabled: false, putCover: () => Promise.reject(new Error("disabled")) },
        CHAIN_ID,
        1024 * 1024
      ),
      getMetadata: new GetMetadata(metadataStore),
      indexerStatus: async () => ({ lastIndexedBlock: await projectionStore.getCursor(CHAIN_ID) }),
      chainId: CHAIN_ID,
      tokenDecimals: 6,
      maxCoverBytes: 1024 * 1024,
      corsOrigin: "*",
      log: silent,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await close();
  });

  it("GET /campaigns matches the frontend's derivations", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v3/campaigns" });
    expect(res.statusCode).toBe(200);
    const { campaigns } = res.json();
    expect(campaigns).toHaveLength(1);
    const c = campaigns[0];
    // pool: 4000 − 400 withdrawn − 900 refunded = 2700; deposited = pool + withdrawn
    expect(c.poolBalance).toBe(2700);
    expect(c.totalWithdrawn).toBe(400);
    expect(c.totalDeposited).toBe(3100);
    expect(c.totalReturned).toBe(40);
    expect(c.lifetimeDeposited).toBe(4000);
    expect(c.status).toBe("returning");
    expect(c.cohortCount).toBe(1);
    expect(c.believers).toBe(2);
    expect(c.angel.address).toBe(ANGEL);
    expect(c.name).toMatch(/^Campaign 0x/); // metadata fallback
  });

  it("GET /campaigns/:address serves settle-aware viewer columns", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v3/campaigns/${CAMPAIGN}?account=${B}`,
    });
    expect(res.statusCode).toBe(200);
    const { cohorts } = res.json();
    expect(cohorts).toHaveLength(1);
    // B never settled: view materialises 10% of 3000 = 300 shares
    expect(cohorts[0].yourShares).toBe(300);
    // c1 acc = 0.1/share → B's 300 shares are owed 30 (birth debt 0)
    expect(cohorts[0].yourClaimable).toBe(30);
    expect(cohorts[0].totalShares).toBe(400);
    expect(cohorts[0].returned).toBe(40);
    expect(cohorts[0].formedAt).not.toBe("");
  });

  it("GET /accounts/:address/positions computes refundable + claimable", async () => {
    const res = await app.inject({ method: "GET", url: `/api/v3/accounts/${B}/positions` });
    const { positions } = res.json();
    expect(positions).toHaveLength(1);
    expect(positions[0].refundable).toBe(2700); // 3000 − 300 converted
    expect(positions[0].totalClaimable).toBe(30);
    expect(positions[0].cohorts).toEqual([{ index: 1, shares: 300, claimable: 30 }]);
  });

  it("GET activity endpoints return UI-shaped items", async () => {
    const campaign = await app.inject({ method: "GET", url: `/api/v3/campaigns/${CAMPAIGN}/activity` });
    expect(campaign.json().activity.map((a: { type: string }) => a.type).sort()).toEqual([
      "deposit", "deposit", "refund", "return", "withdraw",
    ]);
    const account = await app.inject({ method: "GET", url: `/api/v3/accounts/${A}/activity` });
    expect(account.json().activity.map((a: { type: string }) => a.type).sort()).toEqual([
      "deposit", "refund",
    ]);
  });

  describe("premarket orders", () => {
    const order = {
      maker: maker.address.toLowerCase(),
      isSell: true,
      cohortId: "1",
      shareAmount: "100000000",
      usdcAmount: "120000000",
      nonce: "0",
      deadline: String(Math.floor(Date.now() / 1000) + 3600),
    };

    const sign = (o: typeof order, campaign = CAMPAIGN) =>
      maker.signTypedData({
        domain: orderDomain(CHAIN_ID, campaign),
        types: ORDER_TYPES,
        primaryType: "Order",
        message: {
          maker: maker.address,
          isSell: o.isSell,
          cohortId: BigInt(o.cohortId),
          shareAmount: BigInt(o.shareAmount),
          usdcAmount: BigInt(o.usdcAmount),
          nonce: BigInt(o.nonce),
          deadline: BigInt(o.deadline),
        },
      });

    it("accepts a signed order and serves it in the book", async () => {
      const signature = await sign(order);
      const post = await app.inject({
        method: "POST",
        url: `/api/v3/campaigns/${CAMPAIGN}/orders`,
        payload: { order, signature },
      });
      expect(post.statusCode).toBe(201);
      const posted = post.json().order;
      expect(posted.side).toBe("ask");
      expect(posted.price).toBeCloseTo(1.2);
      expect(posted.size).toBe(100);
      expect(posted.fill.signature).toBe(signature.toLowerCase());

      const book = await app.inject({
        method: "GET",
        url: `/api/v3/campaigns/${CAMPAIGN}/orders?cohort=1`,
      });
      const body = book.json();
      expect(body.book.asks).toEqual([{ price: 1.2, size: 100 }]);
      expect(body.book.bids).toEqual([]);
      expect(body.orders).toHaveLength(1);
      expect(body.orders[0].fill.order.usdcAmount).toBe("120000000");
    });

    it("rejects duplicates, foreign signatures, expiry and unknown cohorts", async () => {
      const dup = await app.inject({
        method: "POST",
        url: `/api/v3/campaigns/${CAMPAIGN}/orders`,
        payload: { order, signature: await sign(order) },
      });
      expect(dup.statusCode).toBe(409);

      const foreign = { ...order, nonce: "1" };
      const wrongSig = await app.inject({
        method: "POST",
        url: `/api/v3/campaigns/${CAMPAIGN}/orders`,
        // signed for a DIFFERENT campaign → domain mismatch → must not verify
        payload: { order: foreign, signature: await sign(foreign, addr(0xdd)) },
      });
      expect(wrongSig.statusCode).toBe(401);

      const expired = { ...order, nonce: "2", deadline: "1000" };
      const late = await app.inject({
        method: "POST",
        url: `/api/v3/campaigns/${CAMPAIGN}/orders`,
        payload: { order: expired, signature: await sign(expired) },
      });
      expect(late.statusCode).toBe(400);

      const ghostCohort = { ...order, nonce: "3", cohortId: "9" };
      const ghost = await app.inject({
        method: "POST",
        url: `/api/v3/campaigns/${CAMPAIGN}/orders`,
        payload: { order: ghostCohort, signature: await sign(ghostCohort) },
      });
      expect(ghost.statusCode).toBe(400);

      const unknown = await app.inject({
        method: "POST",
        url: `/api/v3/campaigns/${addr(0xde)}/orders`,
        payload: { order, signature: await sign(order) },
      });
      expect(unknown.statusCode).toBe(404);
    });
  });

  describe("metadata", () => {
    const put = async (fields: { name: string; description: string; issuedAt: string }, signer = angel) => {
      const signature = await signer.signMessage({
        message: metadataMessage({ chainId: CHAIN_ID, campaign: CAMPAIGN, ...fields }),
      });
      return app.inject({
        method: "PUT",
        url: `/api/v3/campaigns/${CAMPAIGN}/metadata`,
        payload: { ...fields, signature },
      });
    };

    it("accepts the angel's signed update and serves it back", async () => {
      const res = await put({
        name: "Aurora Compute",
        description: "Distributed GPU cycles.",
        issuedAt: new Date().toISOString(),
      });
      expect(res.statusCode).toBe(200);

      const get = await app.inject({ method: "GET", url: `/api/v3/campaigns/${CAMPAIGN}/metadata` });
      expect(get.json().metadata.name).toBe("Aurora Compute");

      // the campaign list picks the stored name up
      const list = await app.inject({ method: "GET", url: "/api/v3/campaigns" });
      expect(list.json().campaigns[0].name).toBe("Aurora Compute");
    });

    it("rejects non-angel signers and stale timestamps", async () => {
      const impostor = await put(
        { name: "Hostile", description: "", issuedAt: new Date().toISOString() },
        maker
      );
      expect(impostor.statusCode).toBe(403);

      const stale = await put({
        name: "Old",
        description: "",
        issuedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      });
      expect(stale.statusCode).toBe(401);

      // replay: not newer than the accepted watermark
      const watermark = await put({
        name: "Replay",
        description: "",
        issuedAt: new Date(Date.now() - 1000).toISOString(),
      });
      expect(watermark.statusCode).toBe(401);
    });
  });

  it("GET /health reports the cursor", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v3/health" });
    expect(res.json()).toEqual({ ok: true, chainId: CHAIN_ID, lastIndexedBlock: "5" });
  });
});
