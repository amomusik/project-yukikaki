/**
 * Under `next dev`/`next start`, webpack turns lib/db's lazy require("./pglite") into an async
 * module (PGlite is an ESM server-external), so that sync require returns a Promise and getDb()
 * fails with "createPgliteDb is not a function". Importing it here with await (from
 * instrumentation.ts, before any request) and handing lib/db the factory keeps getDb() synchronous.
 * Skipped with Neon configured or on Vercel, so production never loads PGlite.
 */
export async function registerPglite() {
  if (process.env.DATABASE_URL || process.env.VERCEL) return;
  const { createPgliteDb } = await import("./pglite");
  (globalThis as unknown as { __ykPgliteFactory?: typeof createPgliteDb }).__ykPgliteFactory = createPgliteDb;
}
