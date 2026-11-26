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
  /** The title or catch phrase names one of the brief's problem or industry terms (ranked first). */
  headline?: boolean;
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

/**
 * Industry → jGrants search keywords (most specific first; every one is searched) and jGrants
 * `industry` categories. Keywords double as topical terms: a programme whose title names the
 * brief's industry (宿泊, 飲食, 農業, 介護, 除雪 …) is on topic.
 */
const INDUSTRY_TERMS: Record<string, { keywords: string[]; categories: string[] }> = {
  // Not bare 建設: it also names reactor and childcare-facility *construction* programmes.
  snow_removal: { keywords: ["除雪", "建設業", "雪対策", "建築"], categories: ["建設業"] },
  construction: { keywords: ["建設業", "建築", "リフォーム", "住宅"], categories: ["建設業"] },
  ramen: { keywords: ["飲食", "飲食店", "小売", "食品"], categories: ["宿泊業、飲食サービス業"] },
  soba: { keywords: ["飲食", "飲食店", "小売", "食品"], categories: ["宿泊業、飲食サービス業"] },
  izakaya: { keywords: ["飲食", "飲食店", "小売"], categories: ["宿泊業、飲食サービス業"] },
  restaurant: { keywords: ["飲食", "飲食店", "小売", "食品"], categories: ["宿泊業、飲食サービス業"] },
  cafe: { keywords: ["飲食", "飲食店", "小売"], categories: ["宿泊業、飲食サービス業"] },
  bakery: { keywords: ["小売", "食品", "飲食"], categories: ["卸売業、小売業", "製造業", "宿泊業、飲食サービス業"] },
  ryokan: { keywords: ["宿泊", "観光", "旅館", "インバウンド"], categories: ["宿泊業、飲食サービス業"] },
  minshuku: { keywords: ["宿泊", "観光", "民泊", "インバウンド"], categories: ["宿泊業、飲食サービス業"] },
  guesthouse: { keywords: ["宿泊", "観光", "民泊", "インバウンド"], categories: ["宿泊業、飲食サービス業"] },
  retail: { keywords: ["小売", "商店街", "商業"], categories: ["卸売業、小売業"] },
  hardware: { keywords: ["小売", "商店街", "商業"], categories: ["卸売業、小売業"] },
  florist: { keywords: ["小売", "商店街", "商業"], categories: ["卸売業、小売業"] },
  salon: { keywords: ["美容", "生活衛生", "理容"], categories: ["生活関連サービス業、娯楽業"] },
  clinic: { keywords: ["医療", "診療所", "医療機関"], categories: ["医療、福祉"] },
  care: { keywords: ["介護", "福祉", "介護ロボット", "介護テクノロジー"], categories: ["医療、福祉"] },
  farm: { keywords: ["農業", "スマート農業", "農林水産", "農産物"], categories: ["農業、林業"] },
  fishery: { keywords: ["漁業", "水産", "農林水産"], categories: ["漁業"] },
  food_processing: { keywords: ["食品", "製造業", "食品製造"], categories: ["製造業"] },
  brewery: { keywords: ["酒造", "食品", "日本酒"], categories: ["製造業"] },
  taxi: { keywords: ["タクシー", "運輸", "交通"], categories: ["運輸業、郵便業"] },
};

/**
 * Every Yukikaki brief is about winning back hours with everyday digital tools, so the standard SME
 * productivity programmes (ものづくり・商業・サービス生産性向上促進補助金, 小規模事業者持続化補助金,
 * IT導入補助金, 省力化投資補助金) are on topic for all of them: these are searched and count as topical.
 */
const PROGRAM_KEYWORDS = ["生産性", "持続化", "省力化"];
const PROGRAM_TERMS = ["生産性", "持続化", "省力化", "省人化", "業務効率", "効率化", "DX", "ＤＸ", "デジタル", "IT導入", "ＩＴ導入", "ICT", "ＩＣＴ"];

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
  /** All topical terms (problem ∪ industry). */
  terms: string[];
  problemTerms: string[];
  industryTerms: string[];
  categories: string[];
  /** The brief's own text (for eligibility checks such as founders-only programmes). */
  briefText?: string;
  city: CityProfile | undefined;
  prefecture: Prefecture | undefined;
};

/**
 * jGrants keyword searches: every industry keyword (so programmes for the brief's own sector are
 * found even when they don't mention its problem), the brief's strongest problem themes, and the
 * standard SME productivity programmes. Also returns the topical vocabulary: problem terms
 * (themes + programme terms) and industry terms (keywords + the industry's Japanese names).
 */
export function planGrantQueries(brief: BriefForMatching, maxQueries = 7): QueryPlan {
  const city = findCity(brief.city);
  const prefecture = findPrefecture(city?.prefecture) ?? findPrefecture(brief.city);
  const ind = findIndustry(brief.industry);
  const it = (ind && INDUSTRY_TERMS[ind.key]) || { keywords: [], categories: [] };
  const text = [brief.text, ...(brief.skills ?? []), ...(brief.tools ?? [])].join(" ");
  const themes = detectThemes(text);
  const [k0, k1, k2, k3] = it.keywords;
  const ordered = [k0, themes[0], k1, PROGRAM_KEYWORDS[0], k2, themes[1], PROGRAM_KEYWORDS[1], k3, themes[2], PROGRAM_KEYWORDS[2], ...GENERIC_KEYWORDS].filter(
    (k): k is string => Boolean(k),
  );
  const queries = [...new Set(ordered)].slice(0, maxQueries);
  // Two-character aliases (建設, 農園) are too ambiguous in programme titles; the curated keywords cover them.
  const aliases = ind ? ind.aliases.filter((a) => /[^\x00-\x7f]/u.test(a) && a.length >= 3) : [];
  const industryTerms = [...new Set([...it.keywords, ...(ind ? [ind.ja, ...aliases] : [])])].filter((t) => t.length >= 2);
  const problemTerms = [...new Set([...themes, ...PROGRAM_TERMS])].filter((t) => t.length >= 2 && !industryTerms.includes(t));
  const terms = [...new Set([...themes, ...industryTerms, ...PROGRAM_TERMS])].filter((t) => t.length >= 2);
  return { queries, terms, problemTerms, industryTerms, categories: it.categories, briefText: text, city, prefecture };
}

/* ── Scoring ────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const AREA_POINTS: Record<Exclude<AreaMatch, null>, number> = { prefecture: 3, region: 2, national: 1 };

/** Municipality named in a title, e.g. 【長野県茅野市】… or 都城市中小企業… */
export function titleMunicipality(title: string): string | null {
  const bracket = title.match(/[【\[［]([^】\]］]{1,12}?[市区町村])[】\]］]/u);
  if (bracket) return bracket[1];
  const lead = title.replace(/^(令和\S{1,3}年度|R\d{1,2}年度)[\s　]*/u, "").match(/^([一-龥]{1,4}[市区町村]|[ぁ-んァ-ヶー]{2,5}[市町村])(?=[一-龥ぁ-んァ-ヶ（(])/u);
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

/** Title + catch phrase: what the programme says it is for, in its own headline. */
function headlineText(c: Candidate): string {
  return `${c.summary.title} ${c.detail?.catchPhrase ?? ""}`;
}

/**
 * Headline-topical: the title or catch phrase names one of the brief's problem or industry terms.
 * Only these compete for the top slots; programmes that mention the brief only in a long
 * description rank below them.
 */
export function isHeadlineTopical(c: Candidate, plan: QueryPlan): boolean {
  const text = headlineText(c);
  return plan.terms.some((t) => text.includes(t));
}

/** Programmes for new founders only (創業型 etc.) don't fit an established shop unless the brief is about starting up. */
const FOUNDERS_ONLY = /創業型|創業者向け|創業支援補助|スタートアップ/u;
const FOUNDING_BRIEF = /創業|開業|起業|start-?up|founding/iu;
/** Municipal pages: 創業支援補助金 / 起業支援 etc. are for new founders too. */
const FOUNDERS_ONLY_PAGE = /創業|起業|開業支援|スタートアップ/u;

/** jGrants also lists follow-up notices (status reports, registrations) that are not calls for applications. */
const NOT_A_CALL = /状況報告|実績報告|報告等について|事業者の登録|変更届|交付決定|採択結果|交付申請等|共同申請/u;

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

  if (FOUNDERS_ONLY.test(s.title) && !FOUNDING_BRIEF.test(plan.briefText ?? "")) return null;

  const headline = `${s.title} ${s.institution ?? ""} ${c.detail?.catchPhrase ?? ""}`;
  const d = c.detail;
  // The industry field is scored as a category fit below; industry enumerations in descriptions are not keywords.
  const body = d ? `${d.usePurpose ?? ""} ${(d.description ?? "").slice(0, 600).replace(INDUSTRY_ENUMERATION, " ")}` : "";
  let kwHead = 0;
  let kwBody = 0;
  for (const t of plan.terms) {
    if (headline.includes(t)) kwHead += 2;
    else if (body.includes(t)) kwBody += 0.5;
  }
  if (d && kwHead + kwBody === 0) return null; // nothing in the published text relates to this brief
  // Long eligibility texts mention many terms; title / catch-phrase hits are the strong signal.
  score += Math.min(kwHead, 6) + Math.min(kwBody, 1);
  // Naming both the brief's industry and its problem in the headline is the best fit.
  if (plan.industryTerms.some((t) => headline.includes(t)) && plan.problemTerms.some((t) => headline.includes(t))) score += 1;
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

function toMatch(c: Candidate, score: number, headline: boolean): GrantMatch {
  const s = c.summary;
  const d = c.detail ?? null;
  return {
    headline,
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

/** Headline-topical programmes first, then score, then the sooner deadline. */
const byScoreThenDeadline = (a: GrantMatch, b: GrantMatch) =>
  Number(Boolean(b.headline)) - Number(Boolean(a.headline)) ||
  b.score - a.score ||
  (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity);

/** Pure ranking over search results (+ optional details). Exported for tests. */
export function rankCandidates(
  results: Map<string, Candidate>,
  plan: QueryPlan,
  opts: { now?: Date; limit?: number } = {},
): GrantMatch[] {
  const out: GrantMatch[] = [];
  for (const c of results.values()) {
    const score = scoreCandidate(c, plan, opts.now);
    if (score != null) out.push(toMatch(c, score, isHeadlineTopical(c, plan)));
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

export function linkupMatches(results: LinkupResult[], plan: QueryPlan, domains: string[], now = new Date(), limit = 3): GrantMatch[] {
  const cityJa = plan.city?.ja;
  const seen = new Set<string>();
  const out: GrantMatch[] = [];
  for (const r of results) {
    const hay = `${r.title} ${r.snippet}`;
    if (seen.has(r.url) || r.url.includes("jgrants-portal.go.jp")) continue;
    if (!/補助|助成/u.test(hay) || (cityJa && !hay.includes(cityJa))) continue;
    if (/見直し|検討状況|報告|結果|議事|規則|説明会|交付実績|支出状況|一覧表|補助金等の名称|補助事業者等/u.test(r.title)) continue; // policy/admin pages and grant ledgers, not calls
    if (/募集は終了|受付を終了|終了しました|締め切りました|[【［\[(（]\s*(?:募集|受付)?終了\s*[】］\])）]|受付終了|募集終了/u.test(hay)) continue; // closed call
    if (isPastFiscalYear(r.title, now)) continue; // e.g. a 令和7年度 page in FY2026
    if (FOUNDERS_ONLY_PAGE.test(r.title) && !FOUNDING_BRIEF.test(plan.briefText ?? "")) continue; // founders only
    if (!isOfficial(r.url, domains, plan.city?.key)) continue;
    const deadline = parseDeadline(hay);
    if (deadline && deadline.getTime() < now.getTime()) continue; // expired
    seen.add(r.url);
    // Municipal pages compete for the top slots, so like jGrants headline matches their title must
    // name a problem or industry term (no 移住・定住 housing grants for a guesthouse).
    if (!plan.terms.some((t) => r.title.includes(t))) continue;
    const kw = plan.terms.filter((t) => hay.includes(t)).length;
    out.push({
      headline: true,
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
  }
  // Pages that name the brief's problem/industry first; stable for equal scores (search order).
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ── Orchestration ──────────────────────────────────────────────────── */

/** Slots shown first on a challenge (and scored by the grants eval). */
const TOP_SLOTS = 3;

/**
 * Merge municipal (Linkup) programmes into the ranked jGrants list: headline-topical jGrants first,
 * then municipal programmes up to three top slots in total, then the remaining jGrants matches and
 * any further municipal pages (at most three municipal entries overall). Exported for tests.
 */
export function mergeMunicipal(jgrants: GrantMatch[], municipal: GrantMatch[]): GrantMatch[] {
  const strong = jgrants.filter((m) => m.headline);
  const weak = jgrants.filter((m) => !m.headline);
  const fill = Math.max(0, TOP_SLOTS - strong.length);
  const muni = municipal.slice(0, TOP_SLOTS);
  return [...strong, ...muni.slice(0, fill), ...weak, ...muni.slice(fill)];
}

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

  // Municipal programmes (Linkup, official domains only). When jGrants has fewer than three
  // headline-topical programmes, they fill the top three ahead of the weaker jGrants matches; a second,
  // broader municipal search runs only if the first one doesn't get there.
  let final = matches;
  if (deps.linkup && plan.city) {
    const domains = ["lg.jp", "go.jp", ...(plan.city.site ? [plan.city.site] : [])];
    const theme = plan.queries.find((q) => PROBLEM_THEMES.some((t) => t.keyword === q)) ?? "";
    const strong = matches.filter((m) => m.headline);
    const linkupQueries = [
      `${plan.city.ja} ${industryJa(brief.industry)} 補助金 募集 ${theme}`.trim(),
      `${plan.city.ja} 中小企業 補助金 募集 生産性向上 デジタル化`,
    ];
    const municipal: GrantMatch[] = [];
    const seen = new Set(matches.map((m) => m.url));
    for (const [i, query] of linkupQueries.entries()) {
      if (i > 0 && strong.length + municipal.length >= TOP_SLOTS) break;
      try {
        const results = await deps.linkup(query, domains);
        for (const m of linkupMatches(results, plan, domains, now, TOP_SLOTS)) {
          if (seen.has(m.url)) continue;
          seen.add(m.url);
          municipal.push(m);
        }
      } catch (e) {
        warnings.push(`linkup: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    final = mergeMunicipal(matches, municipal);
  }

  return { matches: final, queries: plan.queries, prefecture: plan.prefecture?.ja ?? null, warnings };
}
