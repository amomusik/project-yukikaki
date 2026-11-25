import { execFileSync } from "node:child_process";
import { createClerkClient } from "@clerk/backend";
import { clerkSetup } from "@clerk/testing/playwright";
import { config } from "dotenv";
import { E2E_USERS } from "./users";

/**
 * Create the Clerk test users (idempotent), get a testing token for bot-protection
 * bypass, and — on a shared database (Neon) — wipe data left by earlier E2E runs.
 */
export default async function globalSetup() {
  config({ path: ".env.local", quiet: true });
  await clerkSetup();
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  for (const u of Object.values(E2E_USERS)) {
    const existing = await clerk.users.getUserList({ emailAddress: [u.email] });
    if (existing.data.length === 0) {
      await clerk.users.createUser({ emailAddress: [u.email], firstName: u.firstName, lastName: "E2E", skipPasswordRequirement: true });
    }
  }
  // PGlite is single-process (the dev server holds it), so only clean up on Neon.
  if (process.env.DATABASE_URL) {
    // Run under tsx (ESM + path aliases) rather than Playwright's loader.
    execFileSync("npx", ["tsx", "scripts/e2e-cleanup-cli.ts"], { stdio: "inherit" });
  }
}
