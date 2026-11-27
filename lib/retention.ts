import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Transcript retention (see /privacy). Voice/text transcripts are only needed while a brief is
 * reviewed and worked on, so they are cleared a fixed number of days after the brief was approved
 * or delivered. The structured brief, the evaluation scores and consented quotes are kept.
 */
export const DEFAULT_TRANSCRIPT_RETENTION_DAYS = 90;

export function retentionDays(source: Record<string, string | undefined> = process.env): number {
  const raw = source.TRANSCRIPT_RETENTION_DAYS?.trim();
  if (!raw) return DEFAULT_TRANSCRIPT_RETENTION_DAYS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`TRANSCRIPT_RETENTION_DAYS must be a positive whole number of days, got "${raw}"`);
  return n;
}

export function retentionCutoff(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export type RetentionResult = { cutoff: Date; days: number; dryRun: boolean; briefIds: string[]; evaluationIds: string[] };

/** Briefs whose transcript is still stored and whose approval or delivery is older than the cutoff. */
async function expiredBriefIds(cutoff: Date): Promise<string[]> {
  const db = getDb();
  const approvedBefore = db
    .select({ id: schema.decisions.subjectId })
    .from(schema.decisions)
    .where(and(eq(schema.decisions.subjectType, "brief"), eq(schema.decisions.decision, "approve"), lt(schema.decisions.createdAt, cutoff)));
  const deliveredBefore = db
    .select({ id: schema.deliveries.briefId })
    .from(schema.deliveries)
    .where(lt(schema.deliveries.deliveredAt, cutoff));
  const rows = await db
    .select({ id: schema.briefs.id })
    .from(schema.briefs)
    .where(and(isNotNull(schema.briefs.transcript), or(inArray(schema.briefs.id, approvedBefore), inArray(schema.briefs.id, deliveredBefore))));
  return rows.map((r) => r.id);
}

/** Evaluations whose impact transcript is still stored and whose delivery is older than the cutoff. */
async function expiredEvaluationIds(cutoff: Date): Promise<string[]> {
  const rows = await getDb()
    .select({ id: schema.evaluations.id })
    .from(schema.evaluations)
    .innerJoin(schema.deliveries, eq(schema.evaluations.deliveryId, schema.deliveries.id))
    .where(and(isNotNull(schema.evaluations.impactTranscript), lt(schema.deliveries.deliveredAt, cutoff)));
  return rows.map((r) => r.id);
}

/** Clear expired transcripts (or, with dryRun, only report what would be cleared). */
export async function runRetention(opts: { days: number; now?: Date; dryRun?: boolean }): Promise<RetentionResult> {
  const cutoff = retentionCutoff(opts.days, opts.now);
  const dryRun = Boolean(opts.dryRun);
  const [briefIds, evaluationIds] = await Promise.all([expiredBriefIds(cutoff), expiredEvaluationIds(cutoff)]);
  if (!dryRun) {
    const db = getDb();
    if (briefIds.length) {
      await db.update(schema.briefs).set({ transcript: null, updatedAt: sql`now()` }).where(inArray(schema.briefs.id, briefIds));
    }
    if (evaluationIds.length) {
      await db.update(schema.evaluations).set({ impactTranscript: null }).where(inArray(schema.evaluations.id, evaluationIds));
    }
  }
  return { cutoff, days: opts.days, dryRun, briefIds, evaluationIds };
}
