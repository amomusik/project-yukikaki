import { findCity, type CityProfile } from "@/lib/grounding/city-profiles";
import { findIndustry, industryJa } from "@/lib/grounding/industry-neighbors";
import { isOfficial } from "@/lib/grounding/search";
import type { LinkupResult } from "@/lib/integrations/linkup";
import { areaMatch, findPrefecture, type AreaMatch, type Prefecture } from "./areas";
import { getSubsidyDetail, searchSubsidies, type JGrantDetail, type JGrantSummary, type SearchParams } from "./jgrants";

/**
 * Match open public funding programmes to a brief. Yukikaki only discovers and matches:
 * since Jan 2026 preparing grant applications for pay is reserved to licensed 行政書士,
 * so the host files with a licensed professional.
 */

type GrantSource = "jgrants" | "linkup";

export type GrantMatch = {
  source: GrantSource;
  externalId: string;
  title: string;
  issuer: string | null;
  url: string;
  amountMax: number | null;
  subsidyRate: string | null;
  deadline: Date | null;
  area: string | null;
  score: number;
};

export type BriefForMatching = {
  city: string;
  industry: string;
  /** Free text: titles, problem, process, desired outcome (ja + en). */
  text: string;
  skills?: string[];
  tools?: string[];
};

export type MatchResult = {
  matches: GrantMatch[];
  queries: string[];
  prefecture: string | null;
  /** Non-fatal problems (e.g. optional Linkup enrichment failed). jGrants failures throw. */
  warnings: string[];
};

/* ── Keyword vocabulary ─────────────────────────────────────────────── */

/** Problem themes: jGrants search keyword + text triggers found in briefs. */
const PROBLEM_THEMES: { keyword: string; triggers: RegExp }[] = [
  { keyword: "DX", triggers: /DX|デジタル|digital|\bAI\b|ＡＩ|自動|automat|LINE|ボット|\bbot\b|アプリ|\bapp\b|予約|booking|オンライン|online/giu },
  { keyword: "省力化", triggers: /省力|人手不足|手作業|手書き|by hand|manual|labou?r|staff|効率|efficien|時間|hours|負担/giu },
  { keyword: "IT導入", triggers: /\bIT\b|ＩＴ|システム|system|ソフト|software|ツール|\btool|POS|レジ|register|クラウド|cloud|Excel|エクセル|スプレッドシート|spreadsheet|台帳|ledger/giu },
  { keyword: "インバウンド", triggers: /インバウンド|inbound|訪日|外国人|foreign|touris|観光客|多言語|multilingual|英語対応/giu },
  { keyword: "生産性", triggers: /生産性|productiv|予測|forecast|在庫|stock|inventory|発注|order|廃棄|waste/giu },
  { keyword: "販路開拓", triggers: /販路|集客|marketing|\bEC\b|通販|e-?commerce|SNS|ネットショップ|online shop/giu },
  { keyword: "キャッシュレス", triggers: /キャッシュレス|cashless|決済|payment/giu },
  { keyword: "人材育成", triggers: /人材育成|研修|training|採用|recruit|育成/giu },
];

/** Industry → jGrants search keywords and jGrants `industry` categories. */
const INDUSTRY_TERMS: Record<string, { keywords: string[]; categories: string[] }> = {
  snow_removal: { keywords: ["除雪", "建設業"], categories: ["建設業"] },
  construction: { keywords: ["建設業", "リフォーム"], categories: ["建設業"] },
  ramen: { keywords: ["飲食", "飲食店"], categories: ["宿泊業、飲食サービス業"] },
  soba: { keywords: ["飲食", "飲食店"], categories: ["宿泊業、飲食サービス業"] },
  izakaya: { keywords: ["飲食", "飲食店"], categories: ["宿泊業、飲食サービス業"] },
  restaurant: { keywords: ["飲食", "飲食店"], categories: ["宿泊業、飲食サービス業"] },
  cafe: { keywords: ["飲食", "飲食店"], categories: ["宿泊業、飲食サービス業"] },
  bakery: { keywords: ["小売", "食品", "飲食"], categories: ["卸売業、小売業", "製造業", "宿泊業、飲食サービス業"] },
  ryokan: { keywords: ["宿泊", "観光"], categories: ["宿泊業、飲食サービス業"] },
  minshuku: { keywords: ["宿泊", "観光"], categories: ["宿泊業、飲食サービス業"] },
  guesthouse: { keywords: ["宿泊", "観光"], categories: ["宿泊業、飲食サービス業"] },
  retail: { keywords: ["小売", "商店街"], categories: ["卸売業、小売業"] },
  hardware: { keywords: ["小売", "商店街"], categories: ["卸売業、小売業"] },
  florist: { keywords: ["小売", "商店街"], categories: ["卸売業、小売業"] },
  salon: { keywords: ["美容", "生活衛生"], categories: ["生活関連サービス業、娯楽業"] },
  clinic: { keywords: ["医療", "診療所"], categories: ["医療、福祉"] },
  care: { keywords: ["介護", "福祉"], categories: ["医療、福祉"] },
  farm: { keywords: ["農業", "スマート農業"], categories: ["農業、林業"] },
  fishery: { keywords: ["漁業", "水産"], categories: ["漁業"] },
  food_processing: { keywords: ["食品", "製造業"], categories: ["製造業"] },
  brewery: { keywords: ["酒造", "食品"], categories: ["製造業"] },
  taxi: { keywords: ["タクシー", "運輸"], categories: ["運輸業、郵便業"] },
};

const GENERIC_KEYWORDS = ["中小企業", "小規模事業者"];

function countMatches(re: RegExp, text: string): number {
  return (text.match(new RegExp(re.source, re.flags)) ?? []).length;
}

/** Problem themes found in the brief, strongest first. */
export function detectThemes(text: string): string[] {
  return PROBLEM_THEMES.map((t) => ({ k: t.keyword, n: countMatches(t.triggers, text) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.k);
}

export type QueryPlan = {
  queries: string[];
  terms: string[];
  categories: string[];
  city: CityProfile | undefined;
  prefecture: Prefecture | undefined;
};

/** A few jGrants keyword searches mixing the brief's problem themes and industry. */
export function planGrantQueries(brief: BriefForMatching, maxQueries = 4): QueryPlan {
  const city = findCity(brief.city);
  const prefecture = findPrefecture(city?.prefecture) ?? findPrefecture(brief.city);
  const ind = findIndustry(brief.industry);
  const it = (ind && INDUSTRY_TERMS[ind.key]) || { keywords: [], categories: [] };
  const text = [brief.text, ...(brief.skills ?? []), ...(brief.tools ?? [])].join(" ");
  const themes = detectThemes(text);
  const ordered = [themes[0], it.keywords[0], themes[1], it.keywords[1], themes[2], ...GENERIC_KEYWORDS].filter(
    (k): k is string => Boolean(k),
  );
  const queries = [...new Set(ordered)].slice(0, maxQueries);
  const terms = [...new Set([...themes, ...it.keywords, ...(ind ? [ind.ja, ...ind.aliases.filter((a) => /[^\x00-\x7f]/u.test(a))] : [])])].filter(
    (t) => t.length >= 2,
  );
  return { queries, terms, categories: it.categories, city, prefecture };
}

/* ── Scoring ────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const AREA_POINTS: Record<Exclude<AreaMatch, null>, number> = { prefecture: 3, region: 2, national: 1 };

/** Municipality named in a title, e.g. 【長野県茅野市】… or 都城市中小企業… */
export function titleMunicipality(title: string): string | null {
  const bracket = title.match(/[【\[［]([^】\]］]{1,12}?[市区町村])[】\]］]/u);
  if (bracket) return bracket[1];
  const lead = title.replace(/^(令和\S{1,3}年度|R\d{1,2}年度)[\s　]*/u, "").match(/^([一-龥]{1,4}[市区町村])(?=[一-龥ぁ-んァ-ヶ（(])/u);
  return lead ? lead[1] : null;
}

/** Best-effort issuing body: the municipality or prefecture named in the title. */
export function inferIssuer(title: string, area: string | null): string | null {
  const muni = titleMunicipality(title);
  if (muni) return muni;
  const bracket = title.match(/^[【\[［]([^】\]］]{2,8}?[都道府県庁])[】\]］]/u);
  if (bracket) return bracket[1];
  const pref = area && !area.includes("/") ? findPrefecture(area) : undefined;
  if (pref && title.includes(pref.ja)) return pref.ja;
  return null;
}

export type Candidate = { summary: JGrantSummary; detail?: JGrantDetail | null; hits: number };

/**
 * Runs of three or more industry names (e.g. the SME size table 「農業、林業、漁業、建設業、製造業」 or
 * jGrants' all-industries list). They say who *may* apply, not what the programme is about.
 */
const INDUSTRY_ENUMERATION = /(?:[一-龥ァ-ヶー・]{1,10}業[\s　]*[、，,・／/]?[\s　]*){3,}/gu;

/** Off-topic candidates (no problem/industry keyword in title or description) keep this share of their score… */
const OFF_TOPIC_FACTOR = 0.5;
/** …and are dropped when that falls below this floor. Topical candidates are never dropped by it. */
const OFF_TOPIC_MIN_SCORE = 2.5;

/** What the programme is about: title, catch phrase and description, minus eligibility industry lists. */
function topicalText(c: Candidate): string {
  const d = c.detail;
  const desc = (d?.description ?? "").slice(0, 1200).replace(INDUSTRY_ENUMERATION, " ");
  return `${c.summary.title} ${d?.catchPhrase ?? ""} ${desc}`;
}

/** True when the programme's own text shares a problem/industry keyword with the brief (area alone does not count). */
export function isTopical(c: Candidate, plan: QueryPlan): boolean {
  const text = topicalText(c);
  return plan.terms.some((t) => text.includes(t));
}

/** jGrants also lists follow-up notices (status reports, registrations) that are not calls for applications. */
const NOT_A_CALL = /状況報告|実績報告|報告等について|事業者の登録|変更届|交付決定|採択結果/u;

/**
 * Score a candidate, or null when it must be excluded: expired / not yet open, outside the
 * brief's prefecture/region/nationwide, another municipality's programme, an administrative
 * notice, a programme whose listed industries exclude the brief's industry, or a weak off-topic one.
 */
function scoreCandidate(c: Candidate, plan: QueryPlan, now = new Date()): number | null {
  const s = c.summary;
  if (NOT_A_CALL.test(s.title)) return null;
  if (s.end && s.end.getTime() < now.getTime()) return null; // expired
  if (s.start && s.start.getTime() > now.getTime()) return null; // not yet open
  const am = areaMatch(c.detail?.area ?? s.area, plan.prefecture);
  if (!am) return null;
  const muni = titleMunicipality(s.title);
  const cityJa = plan.city?.ja;
  // A municipal programme of another town in the same prefecture is not available to this business.
  if (muni && !(cityJa && muni.includes(cityJa))) return null;

  let score = AREA_POINTS[am];
  if (muni && cityJa && muni.includes(cityJa)) score += 2;

  const title = `${s.title} ${s.institution ?? ""}`;
  const d = c.detail;
  // The industry field is scored as a category fit below; industry enumerations in descriptions are not keywords.
  const body = d ? `${d.catchPhrase ?? ""} ${d.usePurpose ?? ""} ${(d.description ?? "").slice(0, 600).replace(INDUSTRY_ENUMERATION, " ")}` : "";
  let kwTitle = 0;
  let kwBody = 0;
  for (const t of plan.terms) {
    if (title.includes(t)) kwTitle += 1.5;
    else if (body.includes(t)) kwBody += 0.75;
  }
  if (d && kwTitle + kwBody === 0) return null; // nothing in the published text relates to this brief
  // Long eligibility texts mention many industries; title hits are the stronger signal.
  score += Math.min(kwTitle + Math.min(kwBody, 1.5), 6);
  score += Math.max(0, c.hits - 1) * 0.5;

  if (d?.industry && plan.categories.length) {
    const cats = d.industry.split("/").map((x) => x.trim()).filter(Boolean);
    const fits = plan.categories.some((cat) => cats.includes(cat));
    if (!fits && !cats.some((x) => x.startsWith("分類不能"))) return null; // industry not eligible
    // A targeted programme (few industries) is a stronger signal than an all-industries one.
    if (fits) score += cats.length <= 6 ? 1.5 : 0.25;
  }

  if (s.end) {
    const days = (s.end.getTime() - now.getTime()) / DAY;
    score += days < 7 ? 0 : days <= 90 ? 1 : 0.5;
  } else score += 0.5;
  if (s.maxAmount) score += 0.25;

  // Generic all-comers schemes (e.g. 受動喫煙防止対策助成金 for a snow-removal business) match on area and a
  // coarse use-purpose tag only: rank them below topical programmes, and drop the weak ones once the
  // published description is known.
  if (!isTopical(c, plan)) {
    score *= OFF_TOPIC_FACTOR;
    if (d && score < OFF_TOPIC_MIN_SCORE) return null;
  }
  return Math.round(score * 100) / 100;
}

function toMatch(c: Candidate, score: number): GrantMatch {
  const s = c.summary;
  const d = c.detail ?? null;
  return {
    source: "jgrants",
    externalId: s.id,
    title: s.title,
    issuer: inferIssuer(s.title, d?.area ?? s.area),
    url: d?.url ?? `https://www.jgrants-portal.go.jp/subsidy/${encodeURIComponent(s.id)}`,
    amountMax: d?.maxAmount ?? s.maxAmount,
    subsidyRate: d?.subsidyRate ?? null,
    deadline: d?.end ?? s.end,
    area: d?.area ?? s.area,
    score,
  };
}

/** Same programme, different application rounds (（20次締切）, 第2回募集 …) → one key. */
export function programmeKey(title: string): string {
  return title
    .replace(/[（(【\[][^）)】\]]*(?:次|回|締切|募集|公募)[^）)】\]]*[）)】\]]/gu, "")
    .replace(/第\S{1,3}(?:次|回)(?:締切|募集|公募)?/gu, "")
    .replace(/[\s　]/gu, "");
}

const byScoreThenDeadline = (a: GrantMatch, b: GrantMatch) =>
  b.score - a.score || (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity);

/** Pure ranking over search results (+ optional details). Exported for tests. */
export function rankCandidates(
  results: Map<string, Candidate>,
  plan: QueryPlan,
  opts: { now?: Date; limit?: number } = {},
): GrantMatch[] {
  const out: GrantMatch[] = [];
  for (const c of results.values()) {
    const score = scoreCandidate(c, plan, opts.now);
    if (score != null) out.push(toMatch(c, score));
  }
  // Keep one entry per programme: the soonest open round (ties → higher score).
  const best = new Map<string, GrantMatch>();
  for (const m of out) {
    const k = programmeKey(m.title);
    const prev = best.get(k);
    const sooner = (x: GrantMatch) => x.deadline?.getTime() ?? Infinity;
    if (!prev || sooner(m) < sooner(prev) || (sooner(m) === sooner(prev) && m.score > prev.score)) best.set(k, m);
  }
  return [...best.values()].sort(byScoreThenDeadline).slice(0, opts.limit ?? 5);
}

/* ── Linkup enrichment (municipal programmes not on jGrants) ────────── */

const WAREKI = /(?:令和\s*(\d{1,2})|(20\d{2}))\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u;

/** Parse a closing date written near 締切/期限/まで in a snippet (JST end of day). */
export function parseDeadline(text: string): Date | null {
  const idx = text.search(/締切|締め切り|期限|受付期間|募集期間|まで/u);
  const window = idx >= 0 ? text.slice(Math.max(0, idx - 40), idx + 60) : "";
  const m = window.match(WAREKI);
  if (!m) return null;
  const year = m[1] ? 2018 + Number(m[1]) : Number(m[2]);
  const d = new Date(Date.UTC(year, Number(m[3]) - 1, Number(m[4]), 14, 59)); // 23:59 JST
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Japanese fiscal year (April–March) of a date, in JST. */
function fiscalYear(d: Date): number {
  const jst = new Date(d.getTime() + 9 * 3_600_000);
  return jst.getUTCMonth() >= 3 ? jst.getUTCFullYear() : jst.getUTCFullYear() - 1;
}

/** True when a title names only an earlier fiscal year (令和N年度 / 20XX年度). */
export function isPastFiscalYear(title: string, now = new Date()): boolean {
  const years = [...title.matchAll(/(?:令和\s*([0-9０-９]{1,2})|(20[0-9]{2}))\s*年度/gu)].map((m) =>
    m[1] ? 2018 + Number(m[1].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))) : Number(m[2]),
  );
  return years.length > 0 && Math.max(...years) < fiscalYear(now);
}

export type LinkupSearchFn = (query: string, includeDomains: string[]) => Promise<LinkupResult[]>;

export function linkupMatches(results: LinkupResult[], plan: QueryPlan, domains: string[], now = new Date(), limit = 2): GrantMatch[] {
  const cityJa = plan.city?.ja;
  const seen = new Set<string>();
  const out: GrantMatch[] = [];
  for (const r of results) {
    const hay = `${r.title} ${r.snippet}`;
    if (seen.has(r.url) || r.url.includes("jgrants-portal.go.jp")) continue;
    if (!/補助|助成/u.test(hay) || (cityJa && !hay.includes(cityJa))) continue;
    if (/見直し|検討状況|報告|結果|議事|規則/u.test(r.title)) continue; // policy/admin pages, not programmes
    if (/募集は終了|受付を終了|終了しました|締め切りました/u.test(hay)) continue; // closed call
    if (isPastFiscalYear(r.title, now)) continue; // e.g. a 令和7年度 page in FY2026
    if (!isOfficial(r.url, domains, plan.city?.key)) continue;
    const deadline = parseDeadline(hay);
    if (deadline && deadline.getTime() < now.getTime()) continue; // expired
    seen.add(r.url);
    const kw = plan.terms.filter((t) => hay.includes(t)).length;
    out.push({
      source: "linkup",
      externalId: r.url.slice(0, 500),
      title: r.title.slice(0, 300),
      issuer: new URL(r.url).hostname, // isOfficial() already validated the URL
      url: r.url,
      amountMax: null,
      subsidyRate: null,
      deadline,
      area: plan.prefecture?.ja ?? null,
      score: Math.round((2 + Math.min(kw, 4) * 0.5) * 100) / 100,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* ── Orchestration ──────────────────────────────────────────────────── */

export type MatchDeps = {
  search?: (p: SearchParams) => Promise<JGrantSummary[]>;
  detail?: (id: string) => Promise<JGrantDetail | null>;
  /** Optional municipal enrichment; omit to skip. */
  linkup?: LinkupSearchFn;
  now?: Date;
  limit?: number;
  detailsFor?: number;
};

export async function matchGrants(brief: BriefForMatching, deps: MatchDeps = {}): Promise<MatchResult> {
  const search = deps.search ?? ((p) => searchSubsidies(p));
  const detail = deps.detail ?? ((id) => getSubsidyDetail(id));
  const now = deps.now ?? new Date();
  const limit = deps.limit ?? 5;
  const plan = planGrantQueries(brief);
  const warnings: string[] = [];

  // Sequential on purpose: jGrants rate-limits bursts. Failures throw (live-only).
  const pool = new Map<string, Candidate>();
  for (const keyword of plan.queries) {
    const rows = await search({ keyword, openOnly: true });
    for (const s of rows) {
      const prev = pool.get(s.id);
      pool.set(s.id, { summary: s, hits: (prev?.hits ?? 0) + 1 });
    }
  }

  // Fetch details (subsidy rate, official URL, industry) for the strongest candidates, then re-rank.
  const prelim = rankCandidates(pool, plan, { now, limit: deps.detailsFor ?? 10 });
  for (const m of prelim) {
    const c = pool.get(m.externalId)!;
    c.detail = await detail(m.externalId);
  }
  const shortlisted = new Map(prelim.map((m) => [m.externalId, pool.get(m.externalId)!]));
  const matches = rankCandidates(shortlisted, plan, { now, limit });

  if (deps.linkup && plan.city) {
    const domains = ["lg.jp", "go.jp", ...(plan.city.site ? [plan.city.site] : [])];
    const theme = plan.queries.find((q) => PROBLEM_THEMES.some((t) => t.keyword === q)) ?? "";
    const query = `${plan.city.ja} ${industryJa(brief.industry)} 補助金 募集 ${theme}`.trim();
    try {
      const results = await deps.linkup(query, domains);
      matches.push(...linkupMatches(results, plan, domains, now));
    } catch (e) {
      warnings.push(`linkup: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { matches, queries: plan.queries, prefecture: plan.prefecture?.ja ?? null, warnings };
}
