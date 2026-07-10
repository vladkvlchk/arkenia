/** Indexer worker entrypoint (pm2: `node dist/entry/indexer.js`). */

import { createContainer } from "../app/container.js";

const { config, log, pool, buildIndexer } = createContainer("arkenia-v3-indexer");
const sync = buildIndexer();
const abort = new AbortController();

log.info(
  { chainId: config.chainId, factory: config.factoryAddress, confirmations: config.confirmations },
  "indexer starting"
);

sync
  .runLoop(config.pollIntervalMs, abort.signal)
  .catch((err) => {
    log.error({ err }, "indexer crashed");
    process.exit(1);
  })
  .then(() => pool.end())
  .then(() => process.exit(0));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info({ signal }, "stopping indexer");
    abort.abort();
  });
}
