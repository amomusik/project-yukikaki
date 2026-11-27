import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { BriefStatus } from "@/lib/db/schema";

/** Briefs nobody has picked up yet: deleting them loses nothing for students or the town. */
export const PENDING_DRAFT_STATUSES: BriefStatus[] = ["draft", "enriching", "in_review", "rejected"];

export type DeleteMyDataResult = { transcriptsCleared: number; quotesAnonymized: number; draftsDeleted: number };

/**
 * "Delete my data" for a business owner:
 *  - clears every interview transcript (briefs.transcript) and impact-review transcript they own,
 *  - anonymizes their impact quotes (quote text removed, consent off, marked withdrawn),
 *  - deletes their pending (never-approved) briefs.
 * Approved/delivered briefs stay (students rely on them) but lose the raw transcript.
 */
export async function deleteMyData(ownerUserId: string, now = new Date()): Promise<DeleteMyDataResult> {
  const db = getDb();
  const owned = await db
    .select({ id: schema.briefs.id, status: schema.briefs.status })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(eq(schema.businesses.ownerUserId, ownerUserId));
  if (owned.length === 0) return { transcriptsCleared: 0, quotesAnonymized: 0, draftsDeleted: 0 };
  const briefIds = owned.map((b) => b.id);

  // Pending drafts with no team attached are deleted outright (data_sources / grants / event links cascade).
  const pending = owned.filter((b) => PENDING_DRAFT_STATUSES.includes(b.status)).map((b) => b.id);
  const withTeams = pending.length
    ? (await db.select({ id: schema.teams.briefId }).from(schema.teams).where(inArray(schema.teams.briefId, pending))).map((r) => r.id)
    : [];
  const deletable = pending.filter((id) => !withTeams.includes(id));
  if (deletable.length) await db.delete(schema.briefs).where(inArray(schema.briefs.id, deletable));

  const kept = briefIds.filter((id) => !deletable.includes(id));
  const cleared = kept.length
    ? await db.update(schema.briefs).set({ transcript: null, updatedAt: now }).where(inArray(schema.briefs.id, kept)).returning({ id: schema.briefs.id })
    : [];

  const evaluations = kept.length
    ? await db
        .select({ evaluation: schema.evaluations })
        .from(schema.evaluations)
        .innerJoin(schema.deliveries, eq(schema.evaluations.deliveryId, schema.deliveries.id))
        .where(inArray(schema.deliveries.briefId, kept))
    : [];
  let quotesAnonymized = 0;
  for (const { evaluation } of evaluations) {
    const summary = { ...(evaluation.impactSummary ?? {}) };
    const hadQuote = typeof summary.quote === "string" && summary.quote.trim().length > 0;
    delete summary.quote;
    delete summary.summary; // ElevenLabs' call summary can paraphrase the owner too
    await db
      .update(schema.evaluations)
      .set({ impactTranscript: null, impactSummary: summary, quoteConsent: false, quoteWithdrawnAt: evaluation.quoteWithdrawnAt ?? now })
      .where(eq(schema.evaluations.id, evaluation.id));
    if (hadQuote) quotesAnonymized++;
  }
  return { transcriptsCleared: cleared.length, quotesAnonymized, draftsDeleted: deletable.length };
}

