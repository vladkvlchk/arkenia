import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Dto } from "../dto.js";
import { addressParam, type HttpDeps } from "../server.js";

const activityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function registerAccountRoutes(app: FastifyInstance, deps: HttpDeps, dto: Dto): void {
  app.get<{ Params: { address: string } }>(
    "/api/v3/accounts/:address/positions",
    async (req, reply) => {
      const address = addressParam(req.params.address, reply);
      if (!address) return;
      const positions = await deps.queries.accountPositions(address);
      return { positions: positions.map(dto.position) };
    }
  );

  app.get<{ Params: { address: string }; Querystring: Record<string, string> }>(
    "/api/v3/accounts/:address/activity",
    async (req, reply) => {
      const address = addressParam(req.params.address, reply);
      if (!address) return;
      const query = activityQuery.parse(req.query);
      const items = await deps.queries.accountActivity(address, query.limit);
      return { activity: items.map(dto.activity) };
    }
  );
}
