import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Hex } from "../../../domain/types.js";
import type { PutMetadataInput } from "../../../application/metadata.js";
import type { Dto } from "../dto.js";
import { addressParam, type HttpDeps } from "../server.js";

const putBody = z.object({
  name: z.string(),
  description: z.string().default(""),
  issuedAt: z.string(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export function registerMetadataRoutes(app: FastifyInstance, deps: HttpDeps, dto: Dto): void {
  app.get<{ Params: { address: string } }>(
    "/api/v3/campaigns/:address/metadata",
    async (req, reply) => {
      const address = addressParam(req.params.address, reply);
      if (!address) return;
      const meta = await deps.getMetadata.execute(address);
      return { metadata: dto.metadata(meta) };
    }
  );

  /**
   * Angel-signed update. Two content types:
   * - application/json — fields only;
   * - multipart/form-data — same fields + optional `cover` file part.
   */
  app.put<{ Params: { address: string } }>(
    "/api/v3/campaigns/:address/metadata",
    async (req, reply) => {
      const address = addressParam(req.params.address, reply);
      if (!address) return;

      let fields: z.infer<typeof putBody>;
      let cover: PutMetadataInput["cover"];

      if (req.isMultipart()) {
        const raw: Record<string, string> = {};
        for await (const part of req.parts()) {
          if (part.type === "file") {
            if (part.fieldname !== "cover") {
              await part.toBuffer(); // drain unexpected file parts
              continue;
            }
            cover = { bytes: await part.toBuffer(), contentType: part.mimetype };
          } else {
            raw[part.fieldname] = String(part.value);
          }
        }
        fields = putBody.parse(raw);
      } else {
        fields = putBody.parse(req.body);
      }

      const meta = await deps.putMetadata.execute({
        campaign: address,
        name: fields.name,
        description: fields.description,
        issuedAt: fields.issuedAt,
        signature: fields.signature.toLowerCase() as Hex,
        ...(cover ? { cover } : {}),
      });
      return reply.send({ metadata: dto.metadata(meta) });
    }
  );
}
