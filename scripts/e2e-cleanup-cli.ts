import "./load-env";
import { cleanupE2E } from "./e2e-cleanup";

/** `tsx scripts/e2e-cleanup-cli.ts` — called by e2e/global-setup.ts (Neon only). */
cleanupE2E()
  .then((n) => {
    if (n) console.log(`[e2e] removed ${n} brief(s) left by earlier runs`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("[e2e] cleanup failed:", e.message);
    process.exit(1);
  });
