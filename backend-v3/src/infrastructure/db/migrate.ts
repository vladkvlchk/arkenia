/** `npm run migrate` — applies committed SQL migrations from drizzle/. */

import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadConfig } from "../config.js";
import { createDb } from "./client.js";

export const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

async function main() {
  const config = loadConfig();
  const { db, pool } = createDb(config.databaseUrl);
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log("migrations applied");
}

// Run only as a script, not when imported (tests import `migrationsFolder`).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
