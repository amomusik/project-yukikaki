import type { GroundingLevel } from "@/lib/db/schema";
import { withFallback } from "@/lib/integrations/_guard";
import { linkupSearch, type LinkupResult } from "@/lib/integrations/linkup";
import { analogCities, findCity } from "./city-profiles";
import { findIndustry, industryJa, industryNeighbors, industryVocabulary, mentionsAny } from "./industry-neighbors";

export type GroundingSource = {
  title: string;
  url: string;
  snippet: string;
  level: Exclude<GroundingLevel, "ungrounded">;
  matchedCity: string | null;
  query: string;
};

export type GroundingResult = {
  level: GroundingLevel;
  sources: GroundingSource[];
  /** True when Linkup could not be reached at all (vs. reachable but found nothing). */
  unavailable: boolean;
  queries: string[];
};

export type SearchFn = (query: string, opts?: { includeDomains?: string[] }) => Promise<{ ok: boolean; results: LinkupResult[] }>;

/**
 * Grounding only counts official, citable sources: national ministries and agencies (go.jp),
 * prefectures and municipalities (lg.jp, plus each city's own site), universities (ac.jp)
 * and a narrow set of public bodies under or.jp (see isOfficial). Blogs and SEO sites never
 * ground a brief.
 */
export const OFFICIAL_DOMAINS = ["go.jp", "lg.jp", "or.jp", "ac.jp"];

/**
 * or.jp is open to anyone who registers an organisation, so it is NOT trusted as a whole.
 * An or.jp host counts only when its organisation label looks like a local public body:
 *   - social welfare councils      *-shakyo.or.jp, *shakyo.or.jp   (e.g. sapporo-shakyo.or.jp)
 *   - chambers of commerce         *-cci.or.jp, cci-*.or.jp        (e.g. sapporo-cci.or.jp)
 *   - tourism associations         *kanko*, *kankou*, *tourism*    (e.g. kanazawa-kankoukyoukai.or.jp)
 *   - city foundations             *.city-*.or.jp, city-*.or.jp
 * …and, for a city-level search, the host label must also contain the city key or the page
 * title/snippet must name the city. Both conditions are required: いぶすき観光ネット
 * (ibusuki.or.jp) has a page titled 「札幌ラーメン休次郎」 that mentions 札幌 but is a Kagoshima
 * site with no public-body host pattern, so it must not ground a Sapporo brief.
 */
const OR_JP_PUBLIC_BODY = /(?:shakyo|(?:^|-)cci(?:-|$)|kank(?:o|ou)|tourism)/;

export type OfficialContext = {
  /** Title + snippet of the page, used to confirm an or.jp public body is about the city. */
  text?: string;
  city?: { ja: string; en: string } | null;
};

function orJpAllowed(host: string, cityKey: string | undefined, ctx: OfficialContext): boolean {
  const labels = host.replace(/\.or\.jp$/, "").split(".");
  const org = labels[labels.length - 1] ?? "";
  const publicBody = OR_JP_PUBLIC_BODY.test(org) || labels.some((l) => /^city-[a-z-]+$/.test(l));
  if (!publicBody) return false;
  if (!cityKey) return true;
  if (host.includes(cityKey)) return true;
  const text = ctx.text ?? "";
  return !!ctx.city && (text.includes(ctx.city.ja) || text.toLowerCase().includes(ctx.city.en.toLowerCase()));
}

export const defaultSearch: SearchFn = async (query, opts) => {
  const r = await withFallback("linkup", "search", (signal) => linkupSearch(query, signal, opts), [] as LinkupResult[]);
  return { ok: r.ok, results: r.value };
};

type Planned = {
  query: string;
  level: GroundingSource["level"];
  city: { ja: string; en: string; key?: string } | null;
  includeDomains: string[];
};

function mentions(r: LinkupResult, city: Planned["city"]): boolean {
  if (!city) return r.snippet.trim().length > 0;
  const hay = `${r.title} ${r.snippet}`;
  const url = r.url.toLowerCase();
  return hay.includes(city.ja) || hay.toLowerCase().includes(city.en.toLowerCase()) || (!!city.key && url.includes(city.key));
}

/**
 * Defence in depth: keep only URLs whose host ends with an allowed domain, drop personal
 * pages (`/~user/`), narrow or.jp to public bodies (see OR_JP_PUBLIC_BODY), and — for
 * city-level searches — drop another municipality's site (e.g. Yokohama's Kanazawa *ward*
 * must not ground Kanazawa *city*). Also applied to every committed prebaked source.
 */
export function isOfficial(url: string, allowed: string[], cityKey?: string, ctx: OfficialContext = {}): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!allowed.some((d) => host === d || host.endsWith(`.${d}`))) return false;
    if (u.pathname.includes("/~")) return false;
    const muni = host.match(/(?:^|\.)(?:city|town|vill)\.([a-z-]+)\./);
    if (cityKey && muni && muni[1] !== cityKey) return false;
    // Only when or.jp is the sole reason the host is allowed (a city's own site may be listed too).
    if (host.endsWith(".or.jp") && !allowed.some((d) => d !== "or.jp" && (host === d || host.endsWith(`.${d}`)))) {
      if (!orJpAllowed(host, cityKey, ctx)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the query plan for each cascade level. Exported for tests and the prebake script.
 * Every query names the industry (and the exact level adds a second industry word, e.g.
 * ラーメン店 + ラーメン, or the adjacent sector), so city-wide pages about open data or DX
 * policy don't crowd out industry pages.
 */
export function planQueries(input: { city: string; industry: string }): Record<GroundingSource["level"], Planned[]> {
  const profile = findCity(input.city);
  const city = profile ? { ja: profile.ja, en: profile.en, key: profile.key } : { ja: input.city, en: input.city };
  const domains = (site?: string) => (site ? [...OFFICIAL_DOMAINS, site] : OFFICIAL_DOMAINS);
  const cityDomains = domains(profile?.site);
  const ind = industryJa(input.industry);
  const analogs = profile ? analogCities(profile.key, 3) : [];
  const neighbors = industryNeighbors(input.industry).slice(0, 2);
  const alt = findIndustry(input.industry)?.aliases.find((a) => /[^\x00-\x7f]/u.test(a) && a !== ind) ?? neighbors[0]?.ja;
  return {
    exact: [
      { query: `${city.ja} ${ind} 事業者 統計 調査`, level: "exact", city, includeDomains: cityDomains },
      { query: `${city.ja} ${ind} 補助金 支援制度`, level: "exact", city, includeDomains: cityDomains },
      { query: `${city.ja} ${ind} 業務効率化 DX 事例`, level: "exact", city, includeDomains: cityDomains },
      ...(alt ? [{ query: `${city.ja} ${alt} 事業者 支援`, level: "exact" as const, city, includeDomains: cityDomains }] : []),
    ],
    analog: [
      ...analogs.map((a) => ({
        query: `${a.ja} ${ind} 事業者 統計`,
        level: "analog" as const,
        city: { ja: a.ja, en: a.en, key: a.key },
        includeDomains: domains(a.site),
      })),
      ...neighbors.map((n) => ({ query: `${city.ja} ${n.ja} 事業者 統計`, level: "analog" as const, city, includeDomains: cityDomains })),
    ],
    national: [
      { query: `${ind} 全国 統計 e-Stat`, level: "national", city: null, includeDomains: ["go.jp"] },
      { query: `${ind} 中小企業白書 業務効率化`, level: "national", city: null, includeDomains: ["go.jp"] },
    ],
  };
}

/** Industry pages first; generic official pages only to reach `min` sources. Exported for tests. */
export function preferOnTopic<T extends { title: string; snippet: string }>(found: T[], vocabulary: string[], min: number, max: number): T[] {
  if (vocabulary.length === 0) return found.slice(0, max);
  const onTopic = found.filter((s) => mentionsAny(`${s.title} ${s.snippet}`, vocabulary));
  if (onTopic.length >= min) return onTopic.slice(0, max);
  const generic = found.filter((s) => !onTopic.includes(s));
  return [...onTopic, ...generic.slice(0, Math.max(0, min - onTopic.length))];
}

/**
 * Grounding cascade: exact city → analog cities / adjacent industries → national.
 * Stops at the first level with at least `minResults` relevant, de-duplicated results, keeping
 * only pages that mention the industry (or an adjacent one) when there are enough of them, and
 * topping up with generic official pages of that level only to reach `minResults`.
 */
export async function groundBrief(
  input: { city: string; industry: string },
  opts: { search?: SearchFn; minResults?: number; maxSources?: number } = {},
): Promise<GroundingResult> {
  const search = opts.search ?? defaultSearch;
  const minResults = opts.minResults ?? 2;
  const maxSources = opts.maxSources ?? 6;
  const plan = planQueries(input);
  const vocabulary = industryVocabulary(input.industry);
  const seen = new Set<string>();
  const queries: string[] = [];
  let anyOk = false;

  for (const level of ["exact", "analog", "national"] as const) {
    const found: GroundingSource[] = [];
    const responses = await Promise.all(
      plan[level].map(async (p) => ({ p, res: await search(p.query, { includeDomains: p.includeDomains }) })),
    );
    for (const { p, res } of responses) {
      queries.push(p.query);
      anyOk ||= res.ok;
      for (const r of res.results) {
        if (seen.has(r.url) || !mentions(r, p.city) || !isOfficial(r.url, p.includeDomains, p.city?.key, { text: `${r.title} ${r.snippet}`, city: p.city })) continue;
        seen.add(r.url);
        found.push({ ...r, level, matchedCity: p.city?.en ?? null, query: p.query });
      }
    }
    if (found.length >= minResults) {
      return { level, sources: preferOnTopic(found, vocabulary, minResults, maxSources), unavailable: false, queries };
    }
  }
  return { level: "ungrounded", sources: [], unavailable: !anyOk, queries };
}
