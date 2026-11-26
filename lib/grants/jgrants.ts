import { z } from "zod";
import { withFallback } from "@/lib/integrations/_guard";

/**
 * jGrants (デジタル庁 補助金電子申請システム) public API — no key required.
 * Docs: https://developers.digital.go.jp/documents/jgrants/api/ (OpenAPI: jgrants-api.yaml)
 *
 *   GET /v1/public/subsidies?keyword=&sort=&order=&acceptance=[&target_area_search=…]
 *     keyword, sort, order, acceptance are REQUIRED. keyword: 2–255 chars, no spaces.
 *     sort ∈ created_date | acceptance_start_datetime | acceptance_end_datetime; order ∈ ASC | DESC;
 *     acceptance "1" = only programmes currently accepting applications.
 *     target_area_search is an exact single-area filter (北海道 does NOT include 全国 rows),
 *     so we search without it and filter areas client-side.
 *   GET /v1/public/subsidies/id/{id}   (id ≤ 18 chars) → detail incl. subsidy_rate, detail page URL.
 *
 * The API rate-limits bursts (HTTP 429 after ~6 rapid calls), so requests are serialised
 * with a minimum interval and 429s are retried with backoff. All calls go through the
 * integration guard (timeout + service_events row) and failures throw — no stand-in data.
 */
const JGRANTS_API = "https://api.jgrants-portal.go.jp/exp/v1/public";
const JGRANTS_PORTAL = "https://www.jgrants-portal.go.jp";
const jgrantsDetailUrl = (id: string) => `${JGRANTS_PORTAL}/subsidy/${encodeURIComponent(id)}`;

export class JGrantsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "JGrantsError";
  }
}

/* ── Schemas (lenient: the live API differs from the docs, e.g. file fields are arrays) ── */
const amount = z.union([z.number(), z.string()]).nullish();
const str = z.string().nullish();

const summarySchema = z.object({
  id: z.string().min(1).max(18),
  name: str,
  title: z.string().min(1),
  target_area_search: str,
  subsidy_max_limit: amount,
  acceptance_start_datetime: str,
  acceptance_end_datetime: str,
  target_number_of_employees: str,
  institution_name: str,
});

const detailSchema = summarySchema.extend({
  subsidy_catch_phrase: str,
  detail: str,
  use_purpose: str,
  industry: str,
  target_area_detail: str,
  subsidy_rate: str,
  front_subsidy_detail_page_url: str,
});

const listSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    metadata: z.object({ resultset: z.object({ count: z.number() }).optional() }).passthrough().optional(),
    result: z.array(item),
  });

export type JGrantSummary = {
  id: string;
  number: string | null;
  title: string;
  area: string | null;
  maxAmount: number | null;
  start: Date | null;
  end: Date | null;
  employees: string | null;
  institution: string | null;
};

export type JGrantDetail = JGrantSummary & {
  catchPhrase: string | null;
  usePurpose: string | null;
  industry: string | null;
  areaDetail: string | null;
  subsidyRate: string | null;
  url: string;
  /** Plain-text description (HTML stripped, truncated). */
  description: string | null;
};

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toAmount(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,円\s]/g, ""));
  // jGrants uses 0 for "no stated cap".
  return Number.isFinite(n) && n > 0 ? n : null;
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function stripHtml(html: string | null | undefined, max = 1500): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(br|\/p|\/li|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return text ? text.slice(0, max) : null;
}

function normalizeSummary(r: z.infer<typeof summarySchema>): JGrantSummary {
  return {
    id: r.id,
    number: clean(r.name),
    title: r.title.trim(),
    area: clean(r.target_area_search),
    maxAmount: toAmount(r.subsidy_max_limit),
    start: toDate(r.acceptance_start_datetime),
    end: toDate(r.acceptance_end_datetime),
    employees: clean(r.target_number_of_employees),
    institution: clean(r.institution_name),
  };
}

/** Parse a /subsidies list response. Rows that fail validation are dropped, not invented. */
export function parseSubsidiesResponse(json: unknown): JGrantSummary[] {
  const parsed = listSchema(z.unknown()).parse(json);
  return parsed.result.flatMap((row) => {
    const r = summarySchema.safeParse(row);
    return r.success ? [normalizeSummary(r.data)] : [];
  });
}

/** Parse a /subsidies/id/{id} response. Returns null when the result array is empty. */
export function parseSubsidyDetailResponse(json: unknown): JGrantDetail | null {
  const parsed = listSchema(detailSchema).parse(json);
  const r = parsed.result[0];
  if (!r) return null;
  const portalUrl = clean(r.front_subsidy_detail_page_url);
  return {
    ...normalizeSummary(r),
    catchPhrase: clean(r.subsidy_catch_phrase),
    usePurpose: clean(r.use_purpose),
    industry: clean(r.industry),
    areaDetail: clean(r.target_area_detail),
    subsidyRate: clean(r.subsidy_rate),
    // Only trust links that point at the official portal.
    url: portalUrl && portalUrl.startsWith(`${JGRANTS_PORTAL}/`) ? portalUrl : jgrantsDetailUrl(r.id),
    description: stripHtml(r.detail),
  };
}

/* ── Transport ─────────────────────────────────────────────────────── */
export type SearchParams = {
  keyword: string;
  sort?: "created_date" | "acceptance_start_datetime" | "acceptance_end_datetime";
  order?: "ASC" | "DESC";
  /** Default true: only programmes currently accepting applications. */
  openOnly?: boolean;
  targetArea?: string;
  usePurpose?: string;
  industry?: string;
};

export type ClientOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Minimum gap between requests (default 1200 ms; tests pass 0). */
  minIntervalMs?: number;
  /** Retries on HTTP 429 (default 3) with exponential backoff from retryBaseMs (default 2000). */
  retries?: number;
  retryBaseMs?: number;
  timeoutMs?: number;
};

/** jGrants rejects keywords under 2 chars or containing spaces (HTTP 400). */
export function validateKeyword(keyword: string): string {
  const k = keyword.trim();
  if (k.length < 2 || k.length > 255 || /[\s\u3000]/u.test(k)) {
    throw new JGrantsError(`invalid jGrants keyword "${keyword}" (2–255 chars, no spaces)`);
  }
  return k;
}

export function buildSearchUrl(p: SearchParams): string {
  const q = new URLSearchParams({
    keyword: validateKeyword(p.keyword),
    sort: p.sort ?? "acceptance_end_datetime",
    order: p.order ?? "ASC",
    acceptance: p.openOnly === false ? "0" : "1",
  });
  if (p.targetArea) q.set("target_area_search", p.targetArea);
  if (p.usePurpose) q.set("use_purpose", p.usePurpose);
  if (p.industry) q.set("industry", p.industry);
  return `${JGRANTS_API}/subsidies?${q.toString()}`;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });

// Process-wide serialisation so concurrent matches don't trip the rate limit.
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function throttled<T>(minIntervalMs: number, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait, signal);
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function getJson(url: string, opts: ClientOptions): Promise<unknown> {
  const f = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? 3;
  const base = opts.retryBaseMs ?? 2000;
  for (let attempt = 0; ; attempt++) {
    const res = await throttled(
      opts.minIntervalMs ?? 1200,
      () => f(url, { headers: { Accept: "application/json" }, signal: opts.signal }),
      opts.signal,
    );
    if (res.status === 429 && attempt < retries) {
      await sleep(base * 2 ** attempt, opts.signal);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new JGrantsError(`jGrants HTTP ${res.status}: ${body.slice(0, 200)}`, res.status);
    }
    return res.json();
  }
}

/** Unguarded calls (used by tests and inside the guard). */
export async function fetchSubsidies(p: SearchParams, opts: ClientOptions = {}): Promise<JGrantSummary[]> {
  return parseSubsidiesResponse(await getJson(buildSearchUrl(p), opts));
}

export async function fetchSubsidyDetail(id: string, opts: ClientOptions = {}): Promise<JGrantDetail | null> {
  if (!id || id.length > 18) throw new JGrantsError(`invalid jGrants id "${id}"`);
  return parseSubsidyDetailResponse(await getJson(`${JGRANTS_API}/subsidies/id/${encodeURIComponent(id)}`, opts));
}

/** Guarded: logs a service_events row, enforces a timeout, and throws on failure (live-only). */
async function guarded<T>(operation: string, opts: ClientOptions, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const r = await withFallback<T | null>("jgrants", operation, fn, null, { timeoutMs: opts.timeoutMs ?? 45_000 });
  if (!r.ok) throw new JGrantsError(`jGrants ${operation} failed: ${r.error}`);
  return r.value as T;
}

export function searchSubsidies(p: SearchParams, opts: ClientOptions = {}): Promise<JGrantSummary[]> {
  return guarded("search", opts, (signal) => fetchSubsidies(p, { ...opts, signal }));
}

export function getSubsidyDetail(id: string, opts: ClientOptions = {}): Promise<JGrantDetail | null> {
  return guarded("detail", opts, (signal) => fetchSubsidyDetail(id, { ...opts, signal }));
}
