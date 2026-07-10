/**
 * `npm run reindex` — wipe every chain-derived projection and restart history
 * from the factory deploy block. PRESERVES user-submitted state (signed orders,
 * metadata); order fill/cancel projections are reset and re-derived by replay.
 * Use after a deep re-org or a projection bug fix. Stop the indexer first.
 */

import { sql } from "drizzle-orm";
import { createContainer } from "../app/container.js";
import * as t from "../infrastructure/db/schema.js";

const { log, db, pool } = createContainer("arkenia-v3-reindex");

async function main() {
  await db.transaction(async (tx) => {
    await tx.delete(t.chainEvents);
    await tx.delete(t.activity);
    await tx.delete(t.trades);
    await tx.delete(t.shares);
    await tx.delete(t.positions);
    await tx.delete(t.cohorts);
    await tx.delete(t.campaigns);
    await tx.delete(t.makerNonces);
    await tx.delete(t.indexerCursor);
    await tx
      .update(t.orders)
      .set({ filledShares: 0n, status: "open" })
      .where(sql`${t.orders.status} IN ('filled', 'invalidated')`);
  });
  log.info("projections cleared — start the indexer to replay from the deploy block");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    log.error({ err }, "reindex failed");
    process.exit(1);
  });
