import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema.js";

/**
 * Store implementations are written against this handle so the same code runs
 * on node-postgres in production and on PGlite in integration tests, inside or
 * outside a transaction.
 */
export type DbHandle = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(databaseUrl: string): { db: NodePgDatabase<typeof schema>; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
