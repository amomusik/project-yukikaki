import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { BriefStatus } from "@/lib/db/schema";
import { findCity } from "@/lib/grounding/city-profiles";
import { findIndustry } from "@/lib/grounding/industry-neighbors";
import { isUuid } from "@/lib/uuid";

/** Read models for pages. Writes live in lib/briefs, lib/teams, lib/decide, lib/feedback. */

export const PUBLIC_STATUSES: BriefStatus[] = ["approved", "in_progress", "delivered", "evaluated"];

/* ── Search ── */
export const SEARCH_MAX_TOKENS = 8;
export const SEARCH_MAX_LENGTH = 100;

/** Escape LIKE metacharacters so user input is matched literally (used with ESCAPE '\'). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Split a query into words (ASCII and full-width spaces), deduped, capped. */
export function tokenizeQuery(q: string | null | undefined): string[] {
  if (!q) return [];
  const words = q.slice(0, SEARCH_MAX_LENGTH).trim().split(/[\s\u3000]+/u).filter(Boolean);
  return [...new Set(words)].slice(0, SEARCH_MAX_TOKENS);
}

/** A word plus its English/Japanese city and industry aliases (e.g. Sapporo ↔ 札幌). */
export function expandToken(token: string): string[] {
  const terms = new Set([token]);
  const city = findCity(token);
  if (city) [city.en, city.ja, city.key].forEach((t) => terms.add(t));
  const ind = findIndustry(token);
  // findIndustry also does substring matching ("dinner" ⊃ "inn"); only trust it for exact vocabulary
  // words, or for Japanese words that contain one ("ラーメン屋" ⊃ "ラーメン").
  const lower = token.toLowerCase();
  const vocab = ind ? [ind.key, ind.en, ind.ja, ...ind.aliases].map((a) => a.toLowerCase()) : [];
  if (ind && (vocab.includes(lower) || (/[^\x00-\x7f]/u.test(token) && vocab.some((a) => lower.includes(a)))))
    [ind.key, ind.en, ind.ja].forEach((t) => terms.add(t));
  return [...terms];
}

const ilike = (expr: SQL, term: string) => sql`(${expr}) ILIKE ${`%${escapeLike(term)}%`} ESCAPE '\\'`;
const titleFields = (): SQL[] => [
  sql`${schema.briefs.content}->'ja'->>'title'`,
  sql`${schema.briefs.content}->'en'->>'title'`,
];
const searchFields = (): SQL[] => [
  ...titleFields(),
  ...(["problem", "current_process", "desired_outcome"] as const).flatMap((f) => [
    sql`${schema.briefs.content}->'ja'->>${sql.raw(`'${f}'`)}`,
    sql`${schema.briefs.content}->'en'->>${sql.raw(`'${f}'`)}`,
  ]),
  sql`${schema.businesses.name}`,
  sql`${schema.businesses.city}`,
  sql`${schema.businesses.industry}`,
  sql`array_to_string(${schema.briefs.skillsNeeded}, ' ')`,
];
const anyMatch = (fields: SQL[], terms: string[]) => or(...fields.flatMap((f) => terms.map((t) => ilike(f, t))))!;

export type ChallengeFilters = { city?: string; industry?: string; skill?: string; q?: string };

export async function listChallenges(filters: ChallengeFilters, opts: { limit?: number } = {}) {
  const db = getDb();
  const tokens = tokenizeQuery(filters.q).map(expandToken);
  // Each word must match somewhere (AND); a word matches if it or any alias hits any field (OR).
  const textMatch = tokens.length ? and(...tokens.map((terms) => anyMatch(searchFields(), terms))) : undefined;
  // Relevance: number of words that hit a title, then recency.
  const titleScore = tokens.length
    ? sql<number>`(${sql.join(
        tokens.map((terms) => sql`CASE WHEN ${anyMatch(titleFields(), terms)} THEN 1 ELSE 0 END`),
        sql` + `,
      )})`
    : undefined;
  const query = db
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(
      and(
        inArray(schema.briefs.status, PUBLIC_STATUSES),
        filters.city ? eq(schema.businesses.city, filters.city) : undefined,
        filters.industry ? eq(schema.businesses.industry, filters.industry) : undefined,
        filters.skill ? sql`${filters.skill} = ANY(${schema.briefs.skillsNeeded})` : undefined,
        textMatch,
      ),
    )
    .orderBy(...(titleScore ? [desc(titleScore)] : []), desc(schema.briefs.updatedAt), desc(schema.briefs.id));
  return opts.limit ? query.limit(opts.limit) : query;
}

export type ChallengeSearchResult = {
  id: string;
  title: string;
  city: string;
  industry: string;
  status: BriefStatus;
  hoursLostPerWeek: number | null;
  skills: string[];
};

/** Compact search results (e.g. landing-page suggestions). Empty q → most recent public challenges. */
export async function searchChallenges(
  q: string,
  { locale = "ja", limit = 6 }: { locale?: "ja" | "en"; limit?: number } = {},
): Promise<ChallengeSearchResult[]> {
  const rows = await listChallenges({ q }, { limit: Math.min(Math.max(1, limit), 20) });
  return rows.map(({ brief, business }) => ({
    id: brief.id,
    title: brief.content[locale]?.title || brief.content.ja?.title || brief.content.en?.title || "",
    city: business.city,
    industry: business.industry,
    status: brief.status,
    hoursLostPerWeek: brief.hoursLostPerWeek ?? null,
    skills: brief.skillsNeeded,
  }));
}

export async function challengeFacets() {
  const db = getDb();
  const rows = await db
    .select({ city: schema.businesses.city, industry: schema.businesses.industry, skills: schema.briefs.skillsNeeded })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(inArray(schema.briefs.status, PUBLIC_STATUSES));
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  return { cities: uniq(rows.map((r) => r.city)), industries: uniq(rows.map((r) => r.industry)), skills: uniq(rows.flatMap((r) => r.skills)) };
}

export async function getBriefDetail(id: string) {
  if (!isUuid(id)) return null;
  const db = getDb();
  const [row] = await db
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(eq(schema.briefs.id, id));
  if (!row) return null;
  const sources = await db.select().from(schema.dataSources).where(eq(schema.dataSources.briefId, id)).orderBy(schema.dataSources.createdAt);
  const teams = await db.select().from(schema.teams).where(eq(schema.teams.briefId, id));
  return { ...row, sources, teams };
}

export async function getTeamDetail(id: string) {
  if (!isUuid(id)) return null;
  const db = getDb();
  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));
  if (!team) return null;
  const members = await db
    .select({ user: schema.users, role: schema.teamMembers.role })
    .from(schema.teamMembers)
    .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
    .where(eq(schema.teamMembers.teamId, id));
  const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, team.briefId));
  const [delivery] = await db.select().from(schema.deliveries).where(eq(schema.deliveries.teamId, id));
  return { team, members, brief, delivery: delivery ?? null };
}

export async function briefsForOwner(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(eq(schema.businesses.ownerUserId, userId))
    .orderBy(desc(schema.briefs.createdAt));
  const deliveries = rows.length
    ? await db
        .select({ delivery: schema.deliveries, lead: schema.users, team: schema.teams })
        .from(schema.deliveries)
        .innerJoin(schema.users, eq(schema.deliveries.supportContactUserId, schema.users.id))
        .innerJoin(schema.teams, eq(schema.deliveries.teamId, schema.teams.id))
        .where(inArray(schema.deliveries.briefId, rows.map((r) => r.brief.id)))
    : [];
  return rows.map((r) => ({ ...r, deliveries: deliveries.filter((d) => d.delivery.briefId === r.brief.id) }));
}

export async function teamsForUser(userId: string) {
  const db = getDb();
  return db
    .select({ team: schema.teams, role: schema.teamMembers.role, brief: schema.briefs })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .innerJoin(schema.briefs, eq(schema.teams.briefId, schema.briefs.id))
    .where(eq(schema.teamMembers.userId, userId))
    .orderBy(desc(schema.teams.createdAt));
}

/* ── Admin ── */
export async function adminQueue() {
  const db = getDb();
  const briefs = await db
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(inArray(schema.briefs.status, ["in_review", "enriching", "draft"]))
    .orderBy(desc(schema.briefs.createdAt));
  const ids = briefs.map((b) => b.brief.id);
  const sources = ids.length ? await db.select().from(schema.dataSources).where(inArray(schema.dataSources.briefId, ids)) : [];
  return briefs.map((b) => ({ ...b, sources: sources.filter((s) => s.briefId === b.brief.id) }));
}

export async function adminTeams() {
  const db = getDb();
  const teams = await db
    .select({ team: schema.teams, brief: schema.briefs })
    .from(schema.teams)
    .innerJoin(schema.briefs, eq(schema.teams.briefId, schema.briefs.id))
    .where(eq(schema.teams.status, "pending"))
    .orderBy(desc(schema.teams.createdAt));
  const ids = teams.map((t) => t.team.id);
  const members = ids.length
    ? await db
        .select({ teamId: schema.teamMembers.teamId, role: schema.teamMembers.role, user: schema.users })
        .from(schema.teamMembers)
        .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
        .where(inArray(schema.teamMembers.teamId, ids))
    : [];
  return teams.map((t) => ({ ...t, members: members.filter((m) => m.teamId === t.team.id) }));
}

export async function adminDeliveries() {
  const db = getDb();
  const rows = await db
    .select({ delivery: schema.deliveries, team: schema.teams, brief: schema.briefs, business: schema.businesses, lead: schema.users })
    .from(schema.deliveries)
    .innerJoin(schema.teams, eq(schema.deliveries.teamId, schema.teams.id))
    .innerJoin(schema.briefs, eq(schema.deliveries.briefId, schema.briefs.id))
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .innerJoin(schema.users, eq(schema.deliveries.supportContactUserId, schema.users.id))
    .orderBy(desc(schema.deliveries.deliveredAt));
  const evals = await db.select().from(schema.evaluations);
  const tokens = await db.select().from(schema.feedbackTokens);
  return rows.map((r) => ({
    ...r,
    evaluation: evals.find((e) => e.deliveryId === r.delivery.id) ?? null,
    tokensSent: tokens.filter((t) => t.deliveryId === r.delivery.id).length,
  }));
}

export async function impactStats() {
  const db = getDb();
  const rows = await db
    .select({ evaluation: schema.evaluations, brief: schema.briefs, business: schema.businesses, team: schema.teams })
    .from(schema.evaluations)
    .innerJoin(schema.deliveries, eq(schema.evaluations.deliveryId, schema.deliveries.id))
    .innerJoin(schema.briefs, eq(schema.deliveries.briefId, schema.briefs.id))
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .innerJoin(schema.teams, eq(schema.deliveries.teamId, schema.teams.id))
    .orderBy(desc(schema.evaluations.submittedAt));
  const total = Math.round(rows.reduce((s, r) => s + Number(r.evaluation.hoursSavedPerWeek ?? 0), 0) * 10) / 10;
  const avg = rows.length ? rows.reduce((s, r) => s + r.evaluation.satisfaction, 0) / rows.length : 0;
  const inUse = rows.filter((r) => r.evaluation.stillInUse).length;
  return { rows, total, avg, inUse };
}

/** Latest event per service for the admin status strip. */
export async function serviceStatus() {
  const rows = await getDb().execute<{ service: string; ok: boolean; error: string | null; created_at: string }>(sql`
    SELECT DISTINCT ON (service) service, ok, error, created_at
    FROM service_events ORDER BY service, created_at DESC`);
  // PGlite returns { rows }, Neon returns { rows } too
  return (rows as unknown as { rows: { service: string; ok: boolean; error: string | null; created_at: string }[] }).rows;
}

export async function recentDecisions(limit = 8) {
  const db = getDb();
  return db
    .select({ decision: schema.decisions, host: schema.users })
    .from(schema.decisions)
    .innerJoin(schema.users, eq(schema.decisions.decidedBy, schema.users.id))
    .orderBy(desc(schema.decisions.createdAt))
    .limit(limit);
}
