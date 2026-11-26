import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { GrantMatchRow } from "@/lib/db/schema";
import { configured } from "@/lib/env";
import { syncBrief } from "@/lib/graph/sync";
import { withFallback } from "@/lib/integrations/_guard";
import { linkupSearch } from "@/lib/integrations/linkup";
import { PUBLIC_STATUSES } from "@/lib/queries";
import { matchGrants, type BriefForMatching, type GrantMatch, type LinkupSearchFn, type MatchDeps } from "./match";

/** Grantline (Foundry Labs) — bilingual grant search + eligibility checks. No public API; we link out. */
export const GRANTLINE_URL = "https://grantline.foundrylabs.co.jp/en/grants";

/** Live Linkup search restricted to official domains; throws on failure so it surfaces as a warning. */
export const liveLinkup: LinkupSearchFn = async (query, includeDomains) => {
  const r = await withFallback("linkup", "grants-search", (signal) => linkupSearch(query, signal, { includeDomains, maxResults: 8 }), null);
  if (!r.ok || !r.value) throw new Error(r.error ?? "linkup failed");
  return r.value;
};

export async function briefForMatching(briefId: string): Promise<{ input: BriefForMatching; status: string } | null> {
  const [row] = await getDb()
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(eq(schema.briefs.id, briefId));
  if (!row) return null;
  const { brief, business } = row;
  const parts = (["ja", "en"] as const).flatMap((l) => {
    const c = brief.content[l];
    return c ? [c.title, c.problem, c.current_process, c.desired_outcome] : [];
  });
  return {
    status: brief.status,
    input: {
      city: business.city,
      industry: business.industry,
      text: parts.join("\n"),
      skills: brief.skillsNeeded,
      tools: brief.toolsUsed,
    },
  };
}

export async function replaceGrantMatches(briefId: string, matches: GrantMatch[], fetchedAt = new Date()): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(schema.grantMatches).where(eq(schema.grantMatches.briefId, briefId));
    if (matches.length === 0) return;
    await tx
      .insert(schema.grantMatches)
      .values(
        matches.map((m) => ({
          briefId,
          source: m.source,
          externalId: m.externalId,
          title: m.title,
          issuer: m.issuer,
          url: m.url,
          amountMax: m.amountMax,
          subsidyRate: m.subsidyRate,
          deadline: m.deadline,
          area: m.area,
          score: m.score,
          fetchedAt,
        })),
      )
      .onConflictDoNothing();
  });
}

export type RefreshResult = { briefId: string; count: number; queries: string[]; prefecture: string | null; warnings: string[] };

/**
 * Re-run matching for one brief and replace its stored matches. jGrants failures throw and
 * leave the previous matches untouched (live-only: no stand-in data). Published briefs are
 * re-projected into Neo4j so Funder→FUNDS edges follow.
 */
export async function refreshGrantMatches(briefId: string, deps: MatchDeps & { sync?: boolean } = {}): Promise<RefreshResult> {
  const b = await briefForMatching(briefId);
  if (!b) throw new Error("Brief not found");
  const linkup = deps.linkup ?? (configured.linkup() ? liveLinkup : undefined);
  const result = await matchGrants(b.input, { ...deps, linkup });
  if (!linkup) result.warnings.push("linkup: not configured — municipal enrichment skipped");
  await replaceGrantMatches(briefId, result.matches);
  if (deps.sync !== false && (PUBLIC_STATUSES as string[]).includes(b.status)) await syncBrief(briefId);
  return { briefId, count: result.matches.length, queries: result.queries, prefecture: result.prefecture, warnings: result.warnings };
}

const openFilter = (now: Date) => or(isNull(schema.grantMatches.deadline), gte(schema.grantMatches.deadline, now));

/** Stored matches for a brief; by default only those whose deadline hasn't passed. */
export async function getGrantMatches(briefId: string, opts: { includeExpired?: boolean; now?: Date } = {}): Promise<GrantMatchRow[]> {
  const now = opts.now ?? new Date();
  return getDb()
    .select()
    .from(schema.grantMatches)
    .where(and(eq(schema.grantMatches.briefId, briefId), opts.includeExpired ? undefined : openFilter(now)))
    .orderBy(desc(schema.grantMatches.score), asc(schema.grantMatches.deadline));
}

/** Per-brief match count + last refresh, for the admin queue. */
export async function grantMatchSummary(briefIds: string[]): Promise<Map<string, { count: number; fetchedAt: Date | null }>> {
  const out = new Map<string, { count: number; fetchedAt: Date | null }>();
  if (briefIds.length === 0) return out;
  const rows = await getDb()
    .select({
      briefId: schema.grantMatches.briefId,
      count: sql<number>`count(*)::int`,
      fetchedAt: sql<string | null>`max(${schema.grantMatches.fetchedAt})`,
    })
    .from(schema.grantMatches)
    .where(inArray(schema.grantMatches.briefId, briefIds))
    .groupBy(schema.grantMatches.briefId);
  for (const r of rows) out.set(r.briefId, { count: Number(r.count), fetchedAt: r.fetchedAt ? new Date(r.fetchedAt) : null });
  return out;
}

export type OpenGrant = GrantMatchRow & {
  challenge: { id: string; titleJa: string; titleEn: string; city: string; industry: string };
};

/** Open matched grants across published challenges (public /grants page and API). */
export async function listOpenGrants(opts: { now?: Date; limit?: number } = {}): Promise<OpenGrant[]> {
  const now = opts.now ?? new Date();
  const rows = await getDb()
    .select({ g: schema.grantMatches, brief: schema.briefs, business: schema.businesses })
    .from(schema.grantMatches)
    .innerJoin(schema.briefs, eq(schema.grantMatches.briefId, schema.briefs.id))
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(and(inArray(schema.briefs.status, PUBLIC_STATUSES), openFilter(now)))
    .orderBy(sql`${schema.grantMatches.deadline} ASC NULLS LAST`, desc(schema.grantMatches.score))
    .limit(opts.limit ?? 200);
  return rows.map(({ g, brief, business }) => ({
    ...g,
    challenge: {
      id: brief.id,
      titleJa: brief.content.ja?.title ?? "",
      titleEn: brief.content.en?.title ?? "",
      city: business.city,
      industry: business.industry,
    },
  }));
}

/** Briefs whose grants should be refreshed in bulk (published challenges). */
export async function publishedBriefIds(): Promise<string[]> {
  const rows = await getDb().select({ id: schema.briefs.id }).from(schema.briefs).where(inArray(schema.briefs.status, PUBLIC_STATUSES));
  return rows.map((r) => r.id);
}
