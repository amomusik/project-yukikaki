import "./load-env";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { getDb, dbKind } from "@/lib/db";

/** `pnpm db:push` — apply ./drizzle migrations to Neon (DATABASE_URL) or local PGlite. */
async function main() {
  const db = getDb();
  const kind = dbKind();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (kind === "neon") await migrateNeon(db as any, { migrationsFolder: "./drizzle" });
  else await migratePglite(db, { migrationsFolder: "./drizzle" });
  console.log(`✓ migrations applied (${kind})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
