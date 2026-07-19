/**
 * pm2 — PRODUCTION, both contours on one box. Run from backend-v3/ after `npm run build`.
 *
 * Each app selects its env file via DOTENV_CONFIG_PATH, which the app's `import "dotenv/config"`
 * honours (resolved relative to cwd = this dir). Create the files from the .example templates:
 *   .env.mainnet  → CHAIN_ID=8453,  PORT=3003, DB arkenia,         CORS https://arkenia.xyz
 *   .env.testnet  → CHAIN_ID=84532, PORT=3005, DB arkenia_testnet, CORS https://testnet.arkenia.xyz
 *
 *   npm run build
 *   pm2 start ecosystem.production.config.cjs && pm2 save
 *
 * The indexer is resumable (block cursor in DB) — safe to restart. There must be NO stray `.env` in
 * this dir (dotenv would load it instead of the DOTENV_CONFIG_PATH target).
 */
const base = { cwd: __dirname, max_restarts: 10 };
const mainnet = { NODE_ENV: "production", DOTENV_CONFIG_PATH: ".env.mainnet" };
const testnet = { NODE_ENV: "production", DOTENV_CONFIG_PATH: ".env.testnet" };

module.exports = {
  apps: [
    { ...base, name: "arkenia-v3-api-mainnet", script: "dist/entry/api.js", env: mainnet, restart_delay: 2000 },
    { ...base, name: "arkenia-v3-indexer-mainnet", script: "dist/entry/indexer.js", env: mainnet, restart_delay: 5000 },
    { ...base, name: "arkenia-v3-api-testnet", script: "dist/entry/api.js", env: testnet, restart_delay: 2000 },
    { ...base, name: "arkenia-v3-indexer-testnet", script: "dist/entry/indexer.js", env: testnet, restart_delay: 5000 },
  ],
};
