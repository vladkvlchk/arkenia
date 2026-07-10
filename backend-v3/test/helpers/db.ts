/** Hermetic Postgres for tests: PGlite + the real committed migrations. */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DbHandle } from "../../src/infrastructure/db/client.js";
import { migrationsFolder } from "../../src/infrastructure/db/migrate.js";
import * as schema from "../../src/infrastructure/db/schema.js";

export async function createTestDb(): Promise<{ db: DbHandle; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as DbHandle, close: () => client.close() };
}
