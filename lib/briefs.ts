import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { BriefContent } from "@/lib/db/schema";
import { briefDraftSchema, type BriefDraft, type ParsedConversation } from "@/lib/integrations/elevenlabs";
import { nonceFromConversation } from "@/lib/interview-nonce";
import { inferSkills } from "@/lib/skills";

/** Same text in both languages until Dify normalises/translates it. */
function draftContent(d: BriefDraft): BriefContent {
  const title = `${d.business_name}: ${d.problem.slice(0, 60)}`;
  const lang = {
    title,
    problem: d.problem,
    current_process: d.current_process,
    desired_outcome: d.desired_outcome,
  };
  return { ja: { ...lang }, en: { ...lang } };
}

/**
 * Create a draft brief (and the business, if needed). Idempotent on conversationId.
 * Shared by the voice interview (ElevenLabs) and the text fallback form.
 */
export async function createBriefFromDraft(
  draft: BriefDraft,
  ctx: { ownerUserId: string | null; businessId?: string | null; conversationId?: string | null; transcript?: string | null },
): Promise<{ briefId: string; created: boolean }> {
  const db = getDb();
  if (ctx.conversationId) {
    const [existing] = await db
      .select({ id: schema.briefs.id })
      .from(schema.briefs)
      .where(eq(schema.briefs.elevenlabsConversationId, ctx.conversationId));
    if (existing) return { briefId: existing.id, created: false };
  }

  let businessId = ctx.businessId ?? null;
  if (businessId) {
    const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId));
    // No owner → never attach to (or edit) an existing business, even an unowned one.
    if (!b || !ctx.ownerUserId || b.ownerUserId !== ctx.ownerUserId) {
      businessId = null; // unknown, ownerless caller, or not this owner's business
    } else {
      // The owner may have corrected their business details in this interview/form.
      await db
        .update(schema.businesses)
        .set({ name: draft.business_name, city: draft.city, ward: draft.ward || null, industry: draft.industry, updatedAt: new Date() })
        .where(eq(schema.businesses.id, b.id));
    }
  }
  if (!businessId) {
    const [b] = await db
      .insert(schema.businesses)
      .values({
        ownerUserId: ctx.ownerUserId,
        name: draft.business_name,
        city: draft.city,
        ward: draft.ward || null,
        industry: draft.industry,
      })
      .returning({ id: schema.businesses.id });
    businessId = b.id;
  }

  const inserted = await db
    .insert(schema.briefs)
    .values({
      businessId,
      elevenlabsConversationId: ctx.conversationId ?? null,
      transcript: ctx.transcript ?? null,
      content: draftContent(draft),
      sourceLanguage: draft.preferred_language,
      toolsUsed: draft.tools_used,
      hoursLostPerWeek: draft.hours_lost_per_week,
      skillsNeeded: inferSkills(draft.problem, draft.current_process, draft.desired_outcome, draft.tools_used),
      dataSensitivity: draft.data_sensitivity,
      status: "draft",
    })
    .onConflictDoNothing({ target: schema.briefs.elevenlabsConversationId })
    .returning({ id: schema.briefs.id });

  if (inserted[0]) return { briefId: inserted[0].id, created: true };
  // Lost a race with the other ingestion path (webhook vs polling): return the winner.
  const [winner] = await db
    .select({ id: schema.briefs.id })
    .from(schema.briefs)
    .where(eq(schema.briefs.elevenlabsConversationId, ctx.conversationId!));
  return { briefId: winner.id, created: false };
}

/** Map an analysed interview conversation to a draft brief. Missing fields fall back to the summary. */
function draftFromConversation(conv: ParsedConversation): BriefDraft {
  const dv = conv.dynamicVariables;
  const merged = {
    business_name: dv.business_name,
    city: dv.city,
    industry: dv.industry,
    ...Object.fromEntries(Object.entries(conv.fields).filter(([, v]) => v !== null && v !== "")),
  } as Record<string, unknown>;
  merged.problem ??= conv.summary ?? conv.transcriptText.slice(0, 500);
  merged.business_name ??= "(unnamed business)";
  merged.city ??= "unknown";
  merged.industry ??= "unknown";
  merged.preferred_language ??= dv.locale;
  return briefDraftSchema.parse(merged);
}

export class InterviewOwnershipError extends Error {}

/**
 * Ingest an analysed interview. Ownership comes ONLY from the server-signed `yk_nonce`
 * dynamic variable (never from browser-supplied user_id/business_id).
 * - `expectedUserId` set (the /api/interviews/complete caller): the nonce must be valid and bound
 *   to that user, otherwise InterviewOwnershipError is thrown and nothing is stored.
 * - Webhook (no expectedUserId): a missing/invalid nonce stores the brief with no owner and no
 *   existing business, for host review only.
 */
export async function ingestInterview(conv: ParsedConversation, opts: { expectedUserId?: string; now?: number } = {}) {
  const nonce = nonceFromConversation(conv, "interview", opts.now);
  if (opts.expectedUserId !== undefined && (!nonce || !nonce.userId || nonce.userId !== opts.expectedUserId)) {
    throw new InterviewOwnershipError("interview nonce missing, invalid or bound to another user");
  }
  return createBriefFromDraft(draftFromConversation(conv), {
    ownerUserId: nonce?.userId ?? null,
    businessId: nonce?.userId ? (nonce.businessId ?? null) : null,
    conversationId: conv.conversationId,
    transcript: conv.transcriptText,
  });
}
