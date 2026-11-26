// Unit + contract suites: same hermetic environment as tests/setup.ts, but no database migration.
// Anything that accidentally touches the DB gets an in-memory PGlite (never Neon).
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
  "REQUIRE_LIVE_SERVICES",
]) {
  delete process.env[k];
}
process.env.FEEDBACK_TOKEN_SECRET = "test-feedback-secret-0123456789abcdef";
process.env.ELEVENLABS_INTERVIEW_AGENT_ID = "agent_interview_test";
process.env.ELEVENLABS_IMPACT_AGENT_ID = "agent_impact_test";
process.env.APP_URL = "http://localhost:3000";

(globalThis as unknown as { __ykPgliteFactory?: unknown }).__ykPgliteFactory = (await import("@/lib/db/pglite")).createPgliteDb;
export {};
