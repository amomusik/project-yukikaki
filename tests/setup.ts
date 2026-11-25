import { beforeAll } from "vitest";

// Every test file gets a fresh in-memory Postgres (PGlite) and no live service keys.
process.env.PGLITE_DIR = "memory://";
for (const k of [
  "DATABASE_URL",
  "NEO4J_URI",
  "NEO4J_PASSWORD",
  "ELEVENLABS_API_KEY",
  "LINKUP_API_KEY",
  "DIFY_BRIEF_REVIEW_KEY",
  "DIFY_TEAM_REVIEW_KEY",
  "ADAPTION_API_KEY",
  "RESEND_API_KEY",
]) {
  delete process.env[k];
}
process.env.FEEDBACK_TOKEN_SECRET = "test-feedback-secret-0123456789abcdef";
process.env.ELEVENLABS_INTERVIEW_AGENT_ID = "agent_interview_test";
process.env.ELEVENLABS_IMPACT_AGENT_ID = "agent_impact_test";
process.env.APP_URL = "http://localhost:3000";

// lib/db loads PGlite lazily via require(); hand it the ESM module directly under Vitest.
(globalThis as unknown as { __ykPgliteFactory?: unknown }).__ykPgliteFactory = (
  await import("@/lib/db/pglite")
).createPgliteDb;

beforeAll(async () => {
  const { getDb } = await import("@/lib/db");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
});
