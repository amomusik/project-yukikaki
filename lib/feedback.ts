import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env, feedbackSecret } from "@/lib/env";
import { withFallback } from "@/lib/integrations/_guard";
import { sendImpactCheckEmail } from "@/lib/integrations/email";
import { impactDraftSchema, roundHours, type ParsedConversation } from "@/lib/integrations/elevenlabs";
import { setBriefStatus } from "@/lib/pipeline/brief";

export const TOKEN_TTL_DAYS = 14;

export function hashToken(token: string): string {
  return createHmac("sha256", feedbackSecret()).update(token).digest("hex");
}

/** Create a single-use token. Only its hash is stored; the raw token exists only in the link. */
export async function createFeedbackToken(deliveryId: string, sentToEmail: string | null, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 86_400_000);
  const [row] = await getDb()
    .insert(schema.feedbackTokens)
    .values({ deliveryId, tokenHash: hashToken(token), expiresAt, sentToEmail })
    .returning();
  return { token, row };
}

export type TokenCheck =
  | { ok: true; tokenId: string; deliveryId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

export async function checkFeedbackToken(token: string, now = new Date()): Promise<TokenCheck> {
  if (!token || token.length < 20) return { ok: false, reason: "invalid" };
  const hash = hashToken(token);
  const [row] = await getDb().select().from(schema.feedbackTokens).where(eq(schema.feedbackTokens.tokenHash, hash));
  if (!row || !timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(hash))) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, tokenId: row.id, deliveryId: row.deliveryId };
}

export type EvaluationInput = {
  hoursSavedPerWeek: number;
  satisfaction: number;
  stillInUse: boolean;
  issues: string;
  wouldRecommend: boolean;
  impactConversationId?: string | null;
};

/** Consume the token (atomically, once) and record the evaluation; brief → evaluated. */
export async function submitEvaluation(token: string, input: EvaluationInput, now = new Date()) {
  const check = await checkFeedbackToken(token, now);
  if (!check.ok) return check;
  const db = getDb();
  const consumed = await db
    .update(schema.feedbackTokens)
    .set({ usedAt: now })
    .where(and(eq(schema.feedbackTokens.id, check.tokenId), isNull(schema.feedbackTokens.usedAt)))
    .returning({ id: schema.feedbackTokens.id });
  if (consumed.length === 0) return { ok: false as const, reason: "used" as const };

  const [evaluation] = await db
    .insert(schema.evaluations)
    .values({
      deliveryId: check.deliveryId,
      hoursSavedPerWeek: Math.max(0, roundHours(Number(input.hoursSavedPerWeek) || 0)),
      satisfaction: Math.min(5, Math.max(1, Math.round(input.satisfaction))),
      stillInUse: input.stillInUse,
      issues: input.issues || null,
      wouldRecommend: input.wouldRecommend,
      impactConversationId: input.impactConversationId || null,
    })
    .onConflictDoNothing({ target: schema.evaluations.deliveryId })
    .returning();

  const [delivery] = await db.select().from(schema.deliveries).where(eq(schema.deliveries.id, check.deliveryId));
  const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, delivery.briefId));
  if (brief.status === "delivered") await setBriefStatus(brief.id, "delivered", "evaluated");
  return { ok: true as const, evaluationId: evaluation?.id ?? null };
}

/** Attach an analysed impact voice review to its evaluation (via conversation id or delivery_id variable). */
export async function ingestImpact(conv: ParsedConversation): Promise<{ attached: boolean }> {
  const db = getDb();
  const draft = impactDraftSchema.parse(conv.fields);
  const deliveryId = typeof conv.dynamicVariables.delivery_id === "string" ? conv.dynamicVariables.delivery_id : null;
  let [evaluation] = await db
    .select()
    .from(schema.evaluations)
    .where(eq(schema.evaluations.impactConversationId, conv.conversationId));
  if (!evaluation && deliveryId) {
    [evaluation] = await db.select().from(schema.evaluations).where(eq(schema.evaluations.deliveryId, deliveryId));
  }
  if (!evaluation) return { attached: false };
  await db
    .update(schema.evaluations)
    .set({
      impactConversationId: conv.conversationId,
      impactTranscript: conv.transcriptText,
      impactSummary: { summary: conv.summary, ...draft },
    })
    .where(eq(schema.evaluations.id, evaluation.id));
  return { attached: true };
}

/** Host action: create a link and email it; on email failure return the link for copy/paste. */
export async function sendImpactCheck(deliveryId: string, locale: "ja" | "en" = "ja") {
  const db = getDb();
  const [row] = await db
    .select({ delivery: schema.deliveries, team: schema.teams, brief: schema.briefs, business: schema.businesses })
    .from(schema.deliveries)
    .innerJoin(schema.teams, eq(schema.deliveries.teamId, schema.teams.id))
    .innerJoin(schema.briefs, eq(schema.deliveries.briefId, schema.briefs.id))
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(eq(schema.deliveries.id, deliveryId));
  if (!row) throw new Error("Delivery not found");
  const owner = row.business.ownerUserId
    ? (await db.select().from(schema.users).where(eq(schema.users.id, row.business.ownerUserId)))[0]
    : undefined;
  const [lead] = await db.select().from(schema.users).where(eq(schema.users.id, row.delivery.supportContactUserId));
  const { token, row: tokenRow } = await createFeedbackToken(deliveryId, owner?.email ?? null);
  const link = `${env.APP_URL.replace(/\/$/, "")}/${locale}/feedback/${token}`;

  let emailed = false;
  if (owner?.email) {
    const r = await withFallback(
      "resend",
      "sendImpactCheck",
      () =>
        sendImpactCheckEmail({
          to: owner.email,
          link,
          businessName: row.business.name,
          teamName: row.team.name,
          leadName: lead?.displayName ?? "",
          locale,
        }),
      null,
    );
    emailed = Boolean(r.value);
  }
  if (!emailed) console.info(`[impact-check] email not sent — share this link manually: ${link}`);
  await db.update(schema.feedbackTokens).set({ emailDelivered: emailed }).where(eq(schema.feedbackTokens.id, tokenRow.id));
  return { link, emailed, to: owner?.email ?? null };
}
