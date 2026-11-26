import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/** A metric with a pass threshold. `higherIsBetter=false` for rates like false positives. */
export type Metric = { name: string; value: number; threshold: number; higherIsBetter?: boolean; note?: string };
export type CaseResult = { id: string; pass: boolean; details: Record<string, unknown> };
export type SuiteResult = {
  suite: string;
  startedAt: string;
  durationS: number;
  metrics: Metric[];
  cases: CaseResult[];
  errors: string[];
};
export type Suite = {
  name: string;
  /** Human-readable cost estimate printed before anything live runs. */
  estimate: (opts: SuiteOpts) => string;
  run: (opts: SuiteOpts) => Promise<Omit<SuiteResult, "suite" | "startedAt" | "durationS">>;
};
export type SuiteOpts = { runs: number; limit?: number; concurrency: number };

export const passed = (m: Metric) => (m.higherIsBetter === false ? m.value <= m.threshold : m.value >= m.threshold);
export const rate = (num: number, den: number) => (den === 0 ? 1 : Math.round((num / den) * 1000) / 1000);
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });

/** Run tasks with bounded concurrency, preserving order. */
export async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export function writeResult(r: SuiteResult, dir = "evals/results"): { json: string; md: string } {
  mkdirSync(dir, { recursive: true });
  const base = path.join(dir, `${r.startedAt.slice(0, 10)}-${r.suite}`);
  writeFileSync(`${base}.json`, JSON.stringify(r, null, 2));
  const ok = r.metrics.every(passed) && r.errors.length === 0;
  const md = [
    `# Eval: ${r.suite} — ${ok ? "PASS" : "FAIL"}`,
    "",
    `Run ${r.startedAt} · ${r.durationS.toFixed(0)} s · ${r.cases.length} cases`,
    "",
    "| metric | value | threshold | result |",
    "|---|---|---|---|",
    ...r.metrics.map((m) => `| ${m.name} | ${m.value} | ${m.higherIsBetter === false ? "≤" : "≥"} ${m.threshold} | ${passed(m) ? "pass" : "**FAIL**"}${m.note ? ` — ${m.note}` : ""} |`),
    "",
    "## Cases",
    "",
    "| case | pass | details |",
    "|---|---|---|",
    ...r.cases.map((c) => `| ${c.id} | ${c.pass ? "✓" : "✗"} | ${JSON.stringify(c.details).replace(/\|/g, "\\|").slice(0, 400)} |`),
    ...(r.errors.length ? ["", "## Errors", "", ...r.errors.map((e) => `- ${e}`)] : []),
    "",
  ].join("\n");
  writeFileSync(`${base}.md`, md);
  return { json: `${base}.json`, md: `${base}.md` };
}

/** Strip phone separators so a reformatted number can't hide from leak checks. */
export const squash = (s: string) => s.replace(/[\s\u3000\-\u2010-\u2015\u30fc\uff0d().+]/g, "").normalize("NFKC");
