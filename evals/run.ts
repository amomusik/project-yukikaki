import "../scripts/load-env";
import { passed, today, writeResult, type Suite, type SuiteResult } from "./lib";

/**
 * `pnpm evals` — live, opt-in evaluation of the AI/LLM paths. Costs partner credits, so it prints an
 * estimate and does nothing live unless `--yes` is given.
 *
 *   pnpm evals --suite=brief-review,grounding,grants,interview   (default: all)
 *   pnpm evals --yes [--runs=2] [--limit=N] [--concurrency=3]
 *
 * Writes evals/results/<date>-<suite>.{json,md} and evals/results/<date>-summary.md.
 * Exit code: 0 all thresholds met · 1 a metric below threshold or a suite errored · 2 not confirmed.
 */
// Evals exercise partner APIs only: never write service_events telemetry into the shared Neon
// database. Guards log to a throwaway in-memory PGlite instead (inserts fail silently there).
delete process.env.DATABASE_URL;
process.env.PGLITE_DIR = "memory://";

const argv = process.argv.slice(2);
const arg = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

async function loadSuites(): Promise<Record<string, Suite>> {
  const [{ briefReview }, { grounding }, { grants }, { interview }] = await Promise.all([
    import("./suites/brief-review"),
    import("./suites/grounding"),
    import("./suites/grants"),
    import("./suites/interview"),
  ]);
  return { [briefReview.name]: briefReview, [grounding.name]: grounding, [grants.name]: grants, [interview.name]: interview };
}

/** Rewrite the per-suite markdown and the summary from saved JSON (no live calls): `pnpm evals --rebuild=<date>`. */
async function rebuild(date: string) {
  const { readdirSync, readFileSync } = await import("node:fs");
  const results = readdirSync("evals/results")
    .filter((f) => f.startsWith(`${date}-`) && f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(`evals/results/${f}`, "utf8")) as SuiteResult);
  for (const r of results) writeResult(r);
  return writeSummary(date, results);
}

async function writeSummary(date: string, results: SuiteResult[]) {
  const ok = results.every((r) => r.errors.length === 0 && r.metrics.length > 0 && r.metrics.every(passed));
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    `evals/results/${date}-summary.md`,
    [
      `# Evals summary — ${date} — ${ok ? "PASS" : "FAIL"}`,
      "",
      "| suite | metric | value | threshold | result |",
      "|---|---|---|---|---|",
      ...results.flatMap((r) => r.metrics.map((m) => `| ${r.suite} | ${m.name} | ${m.value} | ${m.higherIsBetter === false ? "≤" : "≥"} ${m.threshold} | ${passed(m) ? "pass" : "**FAIL**"}${m.note ? ` (${m.note})` : ""} |`)),
      ...results.flatMap((r) => r.errors.map((e) => `| ${r.suite} | error | ${e.replace(/\|/g, "/").slice(0, 200)} | | **FAIL** |`)),
      "",
      "Details per suite: `evals/results/<date>-<suite>.md` / `.json`.",
      "",
    ].join("\n"),
  );
  return ok;
}

async function main() {
  if (arg("rebuild")) process.exit((await rebuild(arg("rebuild")!)) ? 0 : 1);
  const all = await loadSuites();
  const names = (arg("suite") ?? Object.keys(all).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !all[n]);
  if (unknown.length) throw new Error(`unknown suite(s): ${unknown.join(", ")} — choose from ${Object.keys(all).join(", ")}`);
  const opts = { runs: Number(arg("runs") ?? 2), limit: arg("limit") ? Number(arg("limit")) : undefined, concurrency: Number(arg("concurrency") ?? 3) };

  console.log("Cost estimate (live partner APIs):");
  for (const n of names) console.log(`  - ${all[n].estimate(opts)}`);
  if (!argv.includes("--yes")) {
    console.log("\nNothing was run. Re-run with --yes to spend these credits.");
    process.exit(2);
  }
  if (!["1", "true", "yes"].includes(String(process.env.REQUIRE_LIVE_SERVICES).toLowerCase()))
    console.warn("⚠ REQUIRE_LIVE_SERVICES is not set — fallbacks may mask live failures.");

  const results: SuiteResult[] = [];
  for (const n of names) {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    console.log(`\n▶ ${n}`);
    let r: SuiteResult;
    try {
      r = { suite: n, startedAt, durationS: 0, ...(await all[n].run(opts)) };
    } catch (e) {
      r = { suite: n, startedAt, durationS: 0, metrics: [], cases: [], errors: [`suite crashed: ${e instanceof Error ? e.message : String(e)}`] };
    }
    r.durationS = (Date.now() - t0) / 1000;
    r.startedAt = `${today()}${startedAt.slice(10)}`; // file names use the JST date
    const files = writeResult(r);
    for (const m of r.metrics) console.log(`  ${passed(m) ? "✓" : "✗"} ${m.name}: ${m.value} (${m.higherIsBetter === false ? "≤" : "≥"} ${m.threshold})`);
    for (const e of r.errors) console.log(`  ! ${e}`);
    console.log(`  → ${files.md}`);
    results.push(r);
  }

  // The summary covers every suite saved for today (running one suite must not drop the others from
  // it); the exit code reflects only the suites run now.
  const { readdirSync, readFileSync } = await import("node:fs");
  const ran = new Set(results.map((r) => r.suite));
  const earlier = readdirSync("evals/results")
    .filter((f) => f.startsWith(`${today()}-`) && f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(`evals/results/${f}`, "utf8")) as SuiteResult)
    .filter((r) => !ran.has(r.suite));
  await writeSummary(today(), [...earlier, ...results].sort((a, b) => a.suite.localeCompare(b.suite)));
  const ok = results.every((r) => r.errors.length === 0 && r.metrics.length > 0 && r.metrics.every(passed));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
