import { neon, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";

import { serverEnv } from "@/lib/env";

import * as schema from "./schema";

/**
 * Two clients, deliberately (backend spec §3).
 *
 * `db` uses neon-http: one round trip per query, lowest latency, and the right
 * default for the read-heavy marketing site. It cannot run transactions.
 *
 * `dbTx` uses the WebSocket pool driver and exists only for the paths that
 * genuinely need a transaction — the booking insert (booking + status history
 * must both land or neither) and newsletter confirmation. Using it everywhere
 * would pay connection setup on every page render for no benefit.
 *
 * Both are lazily constructed so that importing this module does not force env
 * parsing at build time.
 */

type HttpDb = ReturnType<typeof drizzle<typeof schema>>;
type PoolDb = ReturnType<typeof drizzlePool<typeof schema>>;

let httpDb: HttpDb | undefined;
let poolDb: PoolDb | undefined;
let pool: Pool | undefined;

/** Default client. HTTP, no transactions. */
export function db(): HttpDb {
  if (!httpDb) {
    const sql = neon(serverEnv().DATABASE_URL);
    httpDb = drizzle(sql, { schema });
  }
  return httpDb;
}

/** Transactional client. Use only where a transaction is actually required. */
export function dbTx(): PoolDb {
  if (!poolDb) {
    pool = new Pool({ connectionString: serverEnv().DATABASE_URL });
    poolDb = drizzlePool(pool, { schema });
  }
  return poolDb;
}

/** Close the pool. For scripts and tests — serverless request handlers should not call this. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    poolDb = undefined;
  }
}

export type Db = HttpDb;
export { schema };
