import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import path from "path";
import { config } from "../config";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2AccessKeyId,
    secretAccessKey: config.r2SecretAccessKey,
  },
});

export async function uploadToR2(file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();
  const key = `${crypto.randomBytes(16).toString("hex")}${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: config.r2Bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return `${config.r2PublicUrl}/${key}`;
}
