import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * Local-dev / test database (embedded PGlite). Only loaded by lib/db when DATABASE_URL is
 * unset, so production (Neon) never imports PGlite and never writes to disk.
 */
export function createPgliteDb(dir: string) {
  if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  return { client, db: drizzle(client, { schema }) };
}
