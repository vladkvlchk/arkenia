import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Hex, OrderIntent } from "../../../domain/types.js";
import type { Dto } from "../dto.js";
import { addressParam, type HttpDeps } from "../server.js";

const uint256 = z
  .union([z.string().regex(/^\d+$/, "expected a decimal uint256 string"), z.number().int().nonnegative()])
  .transform((v) => BigInt(v));

const submitBody = z.object({
  order: z.object({
    maker: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    isSell: z.boolean(),
    cohortId: uint256,
    shareAmount: uint256,
    usdcAmount: uint256,
    nonce: uint256,
    deadline: uint256,
  }),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

const bookQuery = z.object({
  cohort: z.coerce.number().int().min(1).optional(),
});

export function registerOrderRoutes(app: FastifyInstance, deps: HttpDeps, dto: Dto): void {
  app.get<{ Params: { address: string }; Querystring: Record<string, string> }>(
    "/api/v3/campaigns/:address/orders",
    async (req, reply) => {
      const address = addressParam(req.params.address, reply);
      if (!address) return;
      const query = bookQuery.parse(req.query);
      const view = await deps.getOrderBook.execute(address, query.cohort);
      return {
        book: {
          campaignAddress: view.campaign,
          ...(view.cohortId !== undefined ? { cohortIndex: view.cohortId } : {}),
          bids: view.bids.map(dto.bookLevel),
          asks: view.asks.map(dto.bookLevel),
          ...(view.lastPrice !== undefined ? { lastPrice: view.lastPrice } : {}),
        },
        orders: view.orders.map(dto.order),
        trades: view.trades.map(dto.trade),
      };
    }
  );

  app.post<{ Params: { address: string } }>(
    "/api/v3/campaigns/:address/orders",
    async (req, reply) => {
      const address = addressParam(req.params.address, reply);
      if (!address) return;
      const body = submitBody.parse(req.body);
      const order: OrderIntent = {
        ...body.order,
        maker: body.order.maker.toLowerCase() as `0x${string}`,
      };
      const stored = await deps.submitOrder.execute({
        campaign: address,
        order,
        signature: body.signature.toLowerCase() as Hex,
      });
      return reply.status(201).send({ order: dto.order(stored) });
    }
  );
}
