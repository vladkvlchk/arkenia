/** API entrypoint (pm2: `node dist/entry/api.js`). */

import { createContainer } from "../app/container.js";

const { config, log, pool, buildApi } = createContainer("arkenia-v3-api");
const app = buildApi();

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => log.info({ port: config.port, chainId: config.chainId }, "api listening"))
  .catch((err) => {
    log.error({ err }, "api failed to start");
    process.exit(1);
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info({ signal }, "shutting down");
    void app
      .close()
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}
