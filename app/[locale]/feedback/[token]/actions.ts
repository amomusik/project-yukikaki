"use server";

import { after } from "next/server";
import { ingestImpact, submitEvaluation } from "@/lib/feedback";
import { roundHours, waitForConversation } from "@/lib/integrations/elevenlabs";
import { withFallback } from "@/lib/integrations/_guard";

export type FeedbackResult = { ok: true } | { ok: false; reason: "invalid" | "expired" | "used" };

export async function submitFeedbackAction(_: FeedbackResult | null, formData: FormData): Promise<FeedbackResult> {
  const token = String(formData.get("token") ?? "");
  const conversationId = String(formData.get("impactConversationId") ?? "") || null;
  const r = await submitEvaluation(token, {
    hoursSavedPerWeek: roundHours(Number(String(formData.get("hoursSavedPerWeek") ?? "0").replace(",", ".")) || 0),
    satisfaction: Number(formData.get("satisfaction") ?? 3),
    stillInUse: formData.get("stillInUse") === "true",
    wouldRecommend: formData.get("wouldRecommend") === "true",
    issues: String(formData.get("issues") ?? ""),
    impactConversationId: conversationId,
  });
  if (!r.ok) return r;
  if (conversationId) {
    // Attach the voice transcript once ElevenLabs has analysed it (webhook does the same in production).
    after(async () => {
      const c = await withFallback("elevenlabs", "waitForImpact", (signal) => waitForConversation(conversationId, { maxWaitMs: 240_000, signal }), null, { timeoutMs: 250_000 });
      if (c.value) await ingestImpact(c.value);
    });
  }
  return { ok: true };
}
