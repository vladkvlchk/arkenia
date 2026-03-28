import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001"),
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  contractAddress: process.env.CONTRACT_ADDRESS || "",
  privateKey: process.env.ADMIN_PRIVATE_KEY || "",
  twitterScoreThreshold: 100,
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://fundraiser:fundraiser@localhost:5432/fundraiser",
  twitterClientId: process.env.TWITTER_CLIENT_ID || "",
  twitterClientSecret: process.env.TWITTER_CLIENT_SECRET || "",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  backendUrl: process.env.BACKEND_URL || "http://localhost:3001",
  factoryAddress: process.env.FACTORY_ADDRESS || "0x475C933d687C7C2B20138D235DAb234D4cec7a90",
  r2AccountId: process.env.R2_ACCOUNT_ID || "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  r2Bucket: process.env.R2_BUCKET || "",
  r2PublicUrl: process.env.R2_PUBLIC_URL || "",
};
