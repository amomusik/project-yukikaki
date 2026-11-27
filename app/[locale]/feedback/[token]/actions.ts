"use server";

import { after } from "next/server";
import { assertImpactConversation, checkFeedbackToken, ingestImpact, submitEvaluation } from "@/lib/feedback";
import { roundHours, waitForConversation } from "@/lib/integrations/elevenlabs";
import { withFallback } from "@/lib/integrations/_guard";
import { withdrawQuoteUrl } from "@/lib/testimonials";
import { parseEvaluationForm } from "./parse";

export type FeedbackResult =
  | { ok: true; withdrawUrl: string | null }
  | { ok: false; reason: "invalid" | "expired" | "used" | "incomplete" };

export async function submitFeedbackAction(_: FeedbackResult | null, formData: FormData): Promise<FeedbackResult> {
  const token = String(formData.get("token") ?? "");
  const locale = String(formData.get("locale") ?? "ja") === "en" ? "en" : "ja";
  // No defaults: an unanswered question is rejected, never recorded as a positive answer.
  const parsed = parseEvaluationForm(formData);
  if (!parsed.ok) return { ok: false, reason: "incomplete" };
  const check = await checkFeedbackToken(token);
  if (!check.ok) return check;
  const input = parsed.value;
  const conversationId = input.impactConversationId;
  const r = await submitEvaluation(token, { ...input, hoursSavedPerWeek: roundHours(input.hoursSavedPerWeek) });
  if (!r.ok) return r;
  if (conversationId) {
    const deliveryId = check.deliveryId;
    // Attach the voice transcript once ElevenLabs has analysed it (webhook does the same in production).
    after(async () => {
      const c = await withFallback("elevenlabs", "waitForImpact", (signal) => waitForConversation(conversationId, { maxWaitMs: 240_000, signal }), null, { timeoutMs: 250_000 });
      if (!c.value) return;
      try {
        // Only an impact-agent call bound server-side to this token's delivery may be attached.
        await assertImpactConversation(conversationId, deliveryId, c.value);
      } catch (e) {
        console.warn("[feedback] impact conversation rejected:", e instanceof Error ? e.message : e);
        return;
      }
      await ingestImpact(c.value);
    });
  }
  return { ok: true, withdrawUrl: r.evaluationId && input.quoteConsent ? withdrawQuoteUrl(r.evaluationId, locale) : null };
}
