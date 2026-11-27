import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env, feedbackSecret } from "@/lib/env";
import { hashToken } from "@/lib/feedback";

export type Testimonial = {
  id: string;
  quote: string;
  businessName: string;
  city: string;
  industry: string;
  hoursSavedPerWeek: number;
  satisfaction: number;
  /** True when the brief comes from synthetic seed data; the UI must label it. */
  isDemo: boolean;
};

/**
 * Real impact-review quotes, as the business owner gave them (evaluations.impact_summary.quote).
 * Only quotes the owner explicitly opted in to (quote_consent) and has not withdrawn are listed.
 * Nothing is paraphrased or translated here; rows without a quote are skipped.
 * Returns [] when the database is unavailable so the landing page simply hides the section.
 */
export async function listTestimonials(limit = 6): Promise<Testimonial[]> {
  try {
    const rows = await getDb()
      .select({ evaluation: schema.evaluations, brief: schema.briefs, business: schema.businesses })
      .from(schema.evaluations)
      .innerJoin(schema.deliveries, eq(schema.evaluations.deliveryId, schema.deliveries.id))
      .innerJoin(schema.briefs, eq(schema.deliveries.briefId, schema.briefs.id))
      .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
      .where(and(eq(schema.evaluations.quoteConsent, true), isNull(schema.evaluations.quoteWithdrawnAt)))
      .orderBy(desc(schema.evaluations.submittedAt))
      .limit(limit * 3);
    return rows
      .map(({ evaluation, brief, business }) => {
        const raw = evaluation.impactSummary?.quote;
        const quote = typeof raw === "string" ? raw.trim() : "";
        return {
          id: evaluation.id,
          quote,
          businessName: business.name,
          city: business.city,
          industry: business.industry,
          hoursSavedPerWeek: Number(evaluation.hoursSavedPerWeek ?? 0),
          satisfaction: Math.max(0, Math.min(5, Math.round(evaluation.satisfaction))),
          isDemo: brief.isSynthetic,
        };
      })
      .filter((t) => t.quote.length > 0)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/* ── Withdrawal: a signed, non-expiring link per evaluation ─────────── */

function withdrawSig(evaluationId: string): string {
  return createHmac("sha256", feedbackSecret()).update(`withdraw-quote:${evaluationId}`).digest("base64url");
}

/** Signed link the owner can open at any time to take their quote down. */
export function withdrawQuoteUrl(evaluationId: string, locale: "ja" | "en" = "ja"): string {
  const qs = new URLSearchParams({ e: evaluationId, sig: withdrawSig(evaluationId) });
  return `${env.APP_URL.replace(/\/$/, "")}/${locale}/feedback/withdraw?${qs}`;
}

export function verifyWithdrawSig(evaluationId: string, sig: string): boolean {
  if (!evaluationId || !sig) return false;
  const expected = Buffer.from(withdrawSig(evaluationId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Withdraw consent: the quote stops showing publicly. Idempotent; returns false for a bad signature. */
export async function withdrawQuote(evaluationId: string, sig: string, now = new Date()): Promise<boolean> {
  if (!verifyWithdrawSig(evaluationId, sig)) return false;
  await getDb()
    .update(schema.evaluations)
    .set({ quoteConsent: false, quoteWithdrawnAt: now })
    .where(and(eq(schema.evaluations.id, evaluationId), isNull(schema.evaluations.quoteWithdrawnAt)));
  return true;
}

/**
 * For the feedback-closed page: the raw one-time token still proves who the owner is, so once the
 * form has been answered we offer the signed withdrawal link for a consented, live quote.
 */
export async function withdrawUrlForToken(token: string, locale: "ja" | "en" = "ja"): Promise<string | null> {
  if (!token || token.length < 20) return null;
  const [row] = await getDb()
    .select({ evaluation: schema.evaluations })
    .from(schema.feedbackTokens)
    .innerJoin(schema.evaluations, eq(schema.evaluations.deliveryId, schema.feedbackTokens.deliveryId))
    .where(eq(schema.feedbackTokens.tokenHash, hashToken(token)));
  if (!row || !row.evaluation.quoteConsent || row.evaluation.quoteWithdrawnAt) return null;
  return withdrawQuoteUrl(row.evaluation.id, locale);
}
