import { readFileSync } from "node:fs";
import { findCity } from "@/lib/grounding/city-profiles";
import { areaMatch, findPrefecture } from "@/lib/grants/areas";
import { matchGrants } from "@/lib/grants/match";
import { pool, rate, type CaseResult, type Suite } from "../lib";

/**
 * Grant matching (live jGrants public API — free, rate-limited; Linkup enrichment off to keep it free).
 * For each seeded brief, the top-3 matches must be: open (deadline in the future or none), in the area
 * (prefecture / region / nationwide), on-topic (title shares a topic keyword), and not a known-bad
 * generic scheme for an unrelated industry.
 */
type Seed = { id: string; city: string; industry: string; text: string; skills: string[]; tools: string[]; topic: string[]; bad: string[] };
const load = (): Seed[] => JSON.parse(readFileSync("evals/datasets/grants.json", "utf8"));

export const grants: Suite = {
  name: "grants",
  estimate: ({ limit }) => `Grants: ${load().slice(0, limit ?? undefined).length} briefs × (~4 searches + ≤10 details) jGrants requests, free public API, ~1.2 s/request rate limit (≈ 1–3 min). No Linkup.`,
  async run({ limit }) {
    const seeds = load().slice(0, limit ?? undefined);
    const errors: string[] = [];
    let slots = 0, open = 0, inArea = 0, onTopic = 0, notBad = 0, briefsWith3 = 0;
    const now = new Date();
    // jGrants rate limit is process-wide; run briefs sequentially.
    const cases: CaseResult[] = await pool(seeds, 1, async (s) => {
      try {
        const r = await matchGrants({ city: s.city, industry: s.industry, text: s.text, skills: s.skills, tools: s.tools }, { now });
        const top = r.matches.slice(0, 3);
        if (top.length >= 3) briefsWith3++;
        const pref = findPrefecture(findCity(s.city)?.prefecture);
        const rows = top.map((m) => {
          const o = !m.deadline || m.deadline.getTime() > now.getTime();
          const a = m.source === "linkup" || areaMatch(m.area, pref) !== null;
          const t = s.topic.some((k) => m.title.includes(k));
          const b = !s.bad.some((k) => m.title.includes(k));
          slots++;
          if (o) open++;
          if (a) inArea++;
          if (t) onTopic++;
          if (b) notBad++;
          return { title: m.title.slice(0, 60), area: m.area, deadline: m.deadline?.toISOString().slice(0, 10) ?? null, score: m.score, open: o, inArea: a, onTopic: t, notBad: b };
        });
        process.stderr.write(`  · ${s.id}: ${r.matches.length} matches (queries: ${r.queries.join(", ")})\n`);
        return { id: s.id, pass: rows.length > 0 && rows.every((x) => x.open && x.inArea && x.notBad) && rows.some((x) => x.onTopic), details: { top: rows, warnings: r.warnings } };
      } catch (e) {
        errors.push(`${s.id}: ${e instanceof Error ? e.message : String(e)}`);
        return { id: s.id, pass: false, details: { error: String(e) } };
      }
    });
    return {
      metrics: [
        { name: "top3_open", value: rate(open, slots), threshold: 1 },
        { name: "top3_in_area", value: rate(inArea, slots), threshold: 1 },
        { name: "top3_on_topic (keyword overlap)", value: rate(onTopic, slots), threshold: 0.6 },
        { name: "top3_no_unrelated_generic_scheme", value: rate(notBad, slots), threshold: 0.9 },
        { name: "briefs_with_3_matches", value: rate(briefsWith3, seeds.length), threshold: 0.6, note: "coverage, not correctness" },
      ],
      cases,
      errors,
    };
  },
};
