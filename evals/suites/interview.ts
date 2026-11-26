import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findCity } from "@/lib/grounding/city-profiles";
import { findIndustry, industryKey } from "@/lib/grounding/industry-neighbors";
import { briefDraftSchema } from "@/lib/integrations/elevenlabs";
import { pool, rate, type CaseResult, type Suite } from "../lib";

/**
 * ElevenLabs interview extraction (live). Reuses scripts/simulate-interview.ts
 * (--interview-only --no-pipeline --persona=… --json-out=…): a sim-owner agent talks to the real
 * interview agent, then ElevenLabs' post-call analysis extracts the data-collection fields.
 * Checks: all briefDraftSchema fields parse (strict), hours within ±20% of the persona's truth,
 * industry and city resolve to the persona's.
 */
type Persona = { intro: string; facts: string; truth: { hours: number; industry: string; city: string } };
const DIR = "evals/datasets/personas";
const personas = () => readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

function simulate(personaFile: string, out: string): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [...process.execArgv, "scripts/simulate-interview.ts", "--interview-only", "--no-pipeline", "--max-turns=16", `--persona=${personaFile}`, `--json-out=${out}`], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    p.stdout.on("data", (d) => (log += d));
    p.stderr.on("data", (d) => (log += d));
    p.on("close", (code) => resolve({ code: code ?? 1, log }));
  });
}

export const interview: Suite = {
  name: "interview",
  estimate: ({ limit }) => {
    const n = personas().slice(0, limit ?? undefined).length;
    return `ElevenLabs interview: ${n} simulated text conversations (≤16 turns each, two agents, gemini-2.5-flash) + post-call analysis ≈ ${n * 3}–${n * 5} min agent time on the ElevenLabs plan`;
  },
  async run({ limit, concurrency }) {
    const files = personas().slice(0, limit ?? undefined);
    const errors: string[] = [];
    const tmp = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), "yk-eval-int-"));
    let parsedOk = 0, strictOk = 0, hoursOk = 0, industryOk = 0, cityOk = 0;
    const cases: CaseResult[] = await pool(files, Math.min(concurrency, 3), async (f) => {
      const persona = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Persona;
      const out = path.join(tmp, f);
      const t0 = Date.now();
      const { code, log } = await simulate(path.join(DIR, f), out);
      process.stderr.write(`  · ${f}: exit ${code} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
      if (!existsSync(out)) {
        errors.push(`${f}: no result (exit ${code}): ${log.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 300)}`);
        return { id: f, pass: false, details: { exit: code } };
      }
      const { interview: r } = JSON.parse(readFileSync(out, "utf8")) as { interview: { fields: Record<string, unknown>; problems: string[]; conversationId: string } };
      const parsed = briefDraftSchema.safeParse(r.fields);
      if (parsed.success) parsedOk++;
      if (r.problems.length === 0) strictOk++;
      const hours = parsed.success ? parsed.data.hours_lost_per_week : null;
      const h = hours != null && Math.abs(hours - persona.truth.hours) <= 0.2 * persona.truth.hours;
      const ind = parsed.success ? (findIndustry(parsed.data.industry)?.key ?? industryKey(parsed.data.industry)) : null;
      const i = ind === persona.truth.industry;
      const c = parsed.success && findCity(parsed.data.city)?.key === persona.truth.city;
      if (h) hoursOk++;
      if (i) industryOk++;
      if (c) cityOk++;
      return {
        id: f.replace(".json", ""),
        pass: parsed.success && r.problems.length === 0 && h && i && Boolean(c),
        details: { conversation: r.conversationId, hours, truthHours: persona.truth.hours, industry: parsed.success ? parsed.data.industry : null, industryKey: ind, city: parsed.success ? parsed.data.city : null, problems: r.problems },
      };
    });
    const n = files.length;
    return {
      metrics: [
        { name: "schema_parse (briefDraftSchema)", value: rate(parsedOk, n), threshold: 1 },
        { name: "strict_fields (all 11 present & typed)", value: rate(strictOk, n), threshold: 0.66 },
        { name: "hours_within_20pct", value: rate(hoursOk, n), threshold: 0.66 },
        { name: "industry_correct", value: rate(industryOk, n), threshold: 0.66 },
        { name: "city_correct", value: rate(cityOk, n), threshold: 1 },
      ],
      cases,
      errors,
    };
  },
};
