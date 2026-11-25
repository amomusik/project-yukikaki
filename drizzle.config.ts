import { defineConfig } from "drizzle-kit";

// Migrations are generated from lib/db/schema.ts (`pnpm db:generate`) and applied
// by `pnpm db:push` (scripts/db-migrate.ts) to Neon or the local PGlite database.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
