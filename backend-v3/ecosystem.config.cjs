/**
 * pm2 process file — `pm2 start ecosystem.config.cjs` from backend-v3/.
 * Run `npm run build && npm run migrate` first. Env comes from backend-v3/.env.
 */
module.exports = {
  apps: [
    {
      name: "arkenia-v3-api",
      script: "dist/entry/api.js",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: "arkenia-v3-indexer",
      script: "dist/entry/indexer.js",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
