import { readFileSync } from "node:fs";
import { analogCities, findCity } from "@/lib/grounding/city-profiles";
import { findIndustry, industryNeighbors } from "@/lib/grounding/industry-neighbors";
import { OFFICIAL_DOMAINS, groundBrief, planQueries } from "@/lib/grounding/search";
import { pool, rate, type CaseResult, type Suite } from "../lib";

/**
 * Grounding cascade (live Linkup). For each seeded city/industry pair:
 *  - every source is on an official domain (go.jp / lg.jp / or.jp / ac.jp / the city's own site),
 *  - matched_city is the city itself or one of its analog cities (or national),
 *  - at least 2 sources.
 * Precision proxy = share of sources that are official AND city-consistent AND mention the industry
 * (or an adjacent industry) in title/snippet.
 */
type Pair = { city: string; industry: string };
const load = (): Pair[] => JSON.parse(readFileSync("evals/datasets/grounding.json", "utf8"));
const LINKUP_EUR_PER_SEARCH = 0.005;

function official(url: string, citySite?: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return [...OFFICIAL_DOMAINS, ...(citySite ? [citySite] : [])].some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export const grounding: Suite = {
  name: "grounding",
  estimate: ({ limit }) => {
    const pairs = load().slice(0, limit ?? undefined);
    const max = pairs.reduce((s, p) => {
      const plan = planQueries(p);
      return s + plan.exact.length + plan.analog.length + plan.national.length;
    }, 0);
    return `Grounding: ${pairs.length} city/industry pairs → ${pairs.length * 3}–${max} Linkup searches (cascade stops early) ≈ €${(pairs.length * 3 * LINKUP_EUR_PER_SEARCH).toFixed(2)}–€${(max * LINKUP_EUR_PER_SEARCH).toFixed(2)}`;
  },
  async run({ limit, concurrency }) {
    const pairs = load().slice(0, limit ?? undefined);
    const errors: string[] = [];
    let srcTotal = 0, srcRelevant = 0, allOfficial = 0, cityOk = 0, enough = 0;
    const cases: CaseResult[] = await pool(pairs, concurrency, async (p) => {
      const city = findCity(p.city);
      const allowedCities = new Set([city?.en, ...analogCities(p.city, 3).map((c) => c.en)].filter(Boolean) as string[]);
      const sites = new Map([city, ...analogCities(p.city, 3)].filter(Boolean).map((c) => [c!.en, c!.site]));
      const ind = findIndustry(p.industry);
      const terms = [ind?.ja, ind?.en, ...(ind?.aliases ?? []), ...industryNeighbors(p.industry).map((n) => n.ja)].filter(Boolean) as string[];
      try {
        const g = await groundBrief(p);
        if (g.unavailable) errors.push(`${p.city}/${p.industry}: Linkup unavailable`);
        const checks = g.sources.map((s) => {
          const off = official(s.url, s.matchedCity ? sites.get(s.matchedCity) : undefined);
          const cityConsistent = s.level === "national" ? s.matchedCity === null : allowedCities.has(s.matchedCity ?? "");
          const onTopic = terms.some((t) => `${s.title} ${s.snippet}`.toLowerCase().includes(t.toLowerCase()));
          return { url: s.url, level: s.level, matchedCity: s.matchedCity, off, cityConsistent, onTopic };
        });
        srcTotal += checks.length;
        srcRelevant += checks.filter((c) => c.off && c.cityConsistent && c.onTopic).length;
        const o = checks.every((c) => c.off);
        const cc = checks.every((c) => c.cityConsistent);
        const en = checks.length >= 2;
        if (o) allOfficial++;
        if (cc) cityOk++;
        if (en) enough++;
        process.stderr.write(`  · ${p.city}/${p.industry}: ${g.level}, ${checks.length} sources\n`);
        return { id: `${p.city} / ${p.industry}`, pass: o && cc && en, details: { level: g.level, sources: checks.length, offTopic: checks.filter((c) => !c.onTopic).map((c) => c.url), nonOfficial: checks.filter((c) => !c.off).map((c) => c.url), wrongCity: checks.filter((c) => !c.cityConsistent).map((c) => `${c.matchedCity} ${c.url}`) } };
      } catch (e) {
        errors.push(`${p.city}/${p.industry}: ${e instanceof Error ? e.message : String(e)}`);
        return { id: `${p.city} / ${p.industry}`, pass: false, details: { error: String(e) } };
      }
    });
    return {
      metrics: [
        { name: "official_domains_only (pairs)", value: rate(allOfficial, pairs.length), threshold: 1 },
        { name: "city_or_analog_match (pairs)", value: rate(cityOk, pairs.length), threshold: 1 },
        { name: "at_least_2_sources (pairs)", value: rate(enough, pairs.length), threshold: 0.875 },
        { name: "precision_proxy (sources official ∧ city-consistent ∧ on-topic)", value: rate(srcRelevant, srcTotal), threshold: 0.6 },
      ],
      cases,
      errors,
    };
  },
};
