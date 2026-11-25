import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import type { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Neon when DATABASE_URL is set; otherwise an embedded PGlite database
 * (./.data/pglite, or `PGLITE_DIR=memory://` in tests). Same schema, same queries.
 * PGlite is required lazily (./pglite) so it is never loaded when DATABASE_URL is set.
 */
export type DB = ReturnType<typeof drizzlePglite<typeof schema>>;

type PgliteFactory = typeof import("./pglite").createPgliteDb;
const g = globalThis as unknown as { __ykDb?: DB; __ykPglite?: PGlite; __ykPgliteFactory?: PgliteFactory };

export function getDb(): DB {
  if (g.__ykDb) return g.__ykDb;
  if (env.DATABASE_URL) {
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    g.__ykDb = drizzleNeon(pool, { schema }) as unknown as DB;
  } else {
    if (process.env.VERCEL) {
      // Serverless filesystems are read-only; never fall back to an on-disk database there.
      throw new Error("DATABASE_URL is not set — PGlite is for local development only");
    }
    // Vitest pre-registers the factory (its native require can't load .ts); webpack and tsx
    // resolve this lazy require themselves.
    const createPgliteDb =
      g.__ykPgliteFactory ??
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("./pglite") as typeof import("./pglite")).createPgliteDb;
    const { client, db } = createPgliteDb(env.PGLITE_DIR ?? "./.data/pglite");
    g.__ykPglite = client;
    g.__ykDb = db;
  }
  return g.__ykDb;
}

export const dbKind = () => (env.DATABASE_URL ? "neon" : "pglite");

export { schema };
