/**
 * pm2 — PRODUCTION, both contours on one box. Run from backend-v3/ after `npm run build`.
 *
 * Each app loads its own gitignored env file (create from the .example templates):
 *   .env.mainnet  → CHAIN_ID=8453,  PORT=3003, DB arkenia,         CORS https://arkenia.xyz
 *   .env.testnet  → CHAIN_ID=84532, PORT=3005, DB arkenia_testnet, CORS https://testnet.arkenia.xyz
 *
 *   npm run build
 *   pm2 start ecosystem.production.config.cjs && pm2 save
 *
 * Requires pm2 ≥ 5 (for `env_file`). The indexer is resumable (block cursor in DB) — safe to restart.
 * There must be NO stray `.env` in this dir (it would shadow the per-app env_file values).
 */
const base = { cwd: __dirname, max_restarts: 10, env: { NODE_ENV: "production" } };

module.exports = {
  apps: [
    { ...base, name: "arkenia-v3-api-mainnet", script: "dist/entry/api.js", env_file: ".env.mainnet", restart_delay: 2000 },
    { ...base, name: "arkenia-v3-indexer-mainnet", script: "dist/entry/indexer.js", env_file: ".env.mainnet", restart_delay: 5000 },
    { ...base, name: "arkenia-v3-api-testnet", script: "dist/entry/api.js", env_file: ".env.testnet", restart_delay: 2000 },
    { ...base, name: "arkenia-v3-indexer-testnet", script: "dist/entry/indexer.js", env_file: ".env.testnet", restart_delay: 5000 },
  ],
};
