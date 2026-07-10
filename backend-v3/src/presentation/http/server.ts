/**
 * HTTP presentation — a Fastify server assembled from injected use cases.
 * Versioned under /api/v3. Request/response shapes are documented in README.md;
 * DTOs conform to the frontend's presentational types.
 */

import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { ZodError } from "zod";
import type { GetOrderBook, SubmitOrder } from "../../application/orders.js";
import type { GetMetadata, PutMetadata } from "../../application/metadata.js";
import type { Queries } from "../../application/queries.js";
import type { Logger } from "../../application/ports.js";
import { DomainError, type DomainErrorCode } from "../../domain/errors.js";
import { makeDto } from "./dto.js";
import { registerAccountRoutes } from "./routes/accounts.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerMetadataRoutes } from "./routes/metadata.js";
import { registerOrderRoutes } from "./routes/orders.js";

export interface HttpDeps {
  queries: Queries;
  submitOrder: SubmitOrder;
  getOrderBook: GetOrderBook;
  putMetadata: PutMetadata;
  getMetadata: GetMetadata;
  /** Ops probe: last indexed block (null before the first batch). */
  indexerStatus: () => Promise<{ lastIndexedBlock: bigint | null }>;
  chainId: number;
  tokenDecimals: number;
  maxCoverBytes: number;
  corsOrigin: string;
  log: Logger;
}

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  invalid_maker: 400,
  invalid_amount: 400,
  unknown_cohort: 400,
  unknown_campaign: 404,
  order_expired: 400,
  nonce_invalidated: 409,
  duplicate_order: 409,
  duplicate_nonce: 409,
  invalid_signature: 401,
  not_angel: 403,
  stale_auth: 401,
  invalid_metadata: 400,
  cover_too_large: 413,
  unsupported_cover_type: 415,
  storage_unconfigured: 503,
};

export function buildServer(deps: HttpDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const dto = makeDto(deps.tokenDecimals);

  void app.register(cors, {
    origin: deps.corsOrigin === "*" ? true : deps.corsOrigin.split(",").map((s) => s.trim()),
    methods: ["GET", "POST", "PUT", "OPTIONS"],
  });
  void app.register(multipart, {
    limits: { fileSize: deps.maxCoverBytes, files: 1, fields: 8 },
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof DomainError) {
      return reply
        .status(STATUS_BY_CODE[err.code])
        .send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "invalid_request", message: "request validation failed", issues: err.issues },
      });
    }
    // fastify-generated errors (body too large, bad json, …) carry a statusCode
    const status = "statusCode" in err && typeof err.statusCode === "number" ? err.statusCode : 500;
    if (status >= 500) deps.log.error({ err, url: req.url }, "unhandled error");
    return reply.status(status).send({
      error: { code: status >= 500 ? "internal" : "bad_request", message: status >= 500 ? "internal error" : err.message },
    });
  });

  app.get("/api/v3/health", async () => {
    const status = await deps.indexerStatus();
    return {
      ok: true,
      chainId: deps.chainId,
      lastIndexedBlock: status.lastIndexedBlock?.toString() ?? null,
    };
  });

  registerCampaignRoutes(app, deps, dto);
  registerAccountRoutes(app, deps, dto);
  registerOrderRoutes(app, deps, dto);
  registerMetadataRoutes(app, deps, dto);

  return app;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Validates and lowercases a path address param; 400s otherwise. */
export function addressParam(value: string, reply: FastifyReply): `0x${string}` | null {
  if (!ADDRESS_RE.test(value)) {
    void reply
      .status(400)
      .send({ error: { code: "invalid_address", message: "expected a 0x-prefixed 20-byte address" } });
    return null;
  }
  return value.toLowerCase() as `0x${string}`;
}
