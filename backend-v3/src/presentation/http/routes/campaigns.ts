import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Dto } from "../dto.js";
import { addressParam, type HttpDeps } from "../server.js";

const listQuery = z.object({
  account: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function registerCampaignRoutes(app: FastifyInstance, deps: HttpDeps, dto: Dto): void {
  app.get("/api/v3/campaigns", async () => {
    const campaigns = await deps.queries.listCampaigns();
    return { campaigns: campaigns.map(dto.campaign) };
  });

  app.get<{ Params: { address: string }; Querystring: Record<string, string> }>(
    "/api/v3/campaigns/:address",
    async (req, reply) => {
      const address = addressParam(req.params.address, reply);
      if (!address) return;
      const query = listQuery.parse(req.query);
      const account = query.account?.toLowerCase() as `0x${string}` | undefined;

      const view = await deps.queries.getCampaign(address);
      const cohorts = await deps.queries.getCohorts(address, account);
      return { campaign: dto.campaign(view), cohorts: cohorts.map(dto.cohort) };
    }
  );

  app.get<{ Params: { address: string }; Querystring: Record<string, string> }>(
    "/api/v3/campaigns/:address/activity",
    async (req, reply) => {
      const address = addressParam(req.params.address, reply);
      if (!address) return;
      const query = listQuery.parse(req.query);
      const items = await deps.queries.campaignActivity(address, query.limit);
      return { activity: items.map(dto.activity) };
    }
  );
}
