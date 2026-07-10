/**
 * Cover storage on Cloudflare R2 (S3-compatible). Keys are content-addressed
 * (campaign + digest) so re-uploads are idempotent and URLs cache forever.
 */

import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { FileStore } from "../../application/ports.js";
import type { Address } from "../../domain/types.js";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export class R2FileStore implements FileStore {
  readonly enabled = true;
  private readonly client: S3Client;

  constructor(private readonly cfg: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async putCover(campaign: Address, bytes: Buffer, contentType: string): Promise<string> {
    const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const ext = EXTENSIONS[contentType] ?? "bin";
    const key = `covers/v3/${campaign.toLowerCase()}-${digest}.${ext}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    return `${this.cfg.publicUrl}/${key}`;
  }
}

/** Stand-in when R2 env vars are absent — metadata works, cover upload 503s. */
export class DisabledFileStore implements FileStore {
  readonly enabled = false;
  putCover(): Promise<string> {
    return Promise.reject(new Error("file storage is not configured"));
  }
}
