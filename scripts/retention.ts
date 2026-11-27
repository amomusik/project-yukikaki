import "./load-env";
import { retentionDays, runRetention } from "@/lib/retention";

/**
 * `pnpm retention [--dry-run]` — clear briefs.transcript and evaluations.impact_transcript
 * TRANSCRIPT_RETENTION_DAYS (default 90) days after the brief was approved or delivered.
 * Run it daily (cron / GitHub Actions). --dry-run only lists what would be cleared.
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.argv.includes("-n");
  const days = retentionDays();
  const r = await runRetention({ days, dryRun });
  const verb = dryRun ? "would clear" : "cleared";
  console.log(`retention: ${days} days (cutoff ${r.cutoff.toISOString()})${dryRun ? " [dry run]" : ""}`);
  console.log(`  ${verb} ${r.briefIds.length} brief transcript(s)`);
  console.log(`  ${verb} ${r.evaluationIds.length} impact transcript(s)`);
  if (dryRun) for (const id of [...r.briefIds.map((id) => `brief ${id}`), ...r.evaluationIds.map((id) => `evaluation ${id}`)]) console.log(`    - ${id}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
