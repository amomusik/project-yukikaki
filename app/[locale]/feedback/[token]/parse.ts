import type { EvaluationInput } from "@/lib/feedback";

export type ParsedEvaluation = { ok: true; value: Required<EvaluationInput> } | { ok: false; missing: string[] };

const yesNo = (v: FormDataEntryValue | null): boolean | null => (v === "true" ? true : v === "false" ? false : null);

/**
 * Parse the written impact form. Satisfaction, still-in-use and would-recommend have no defaults:
 * a missing answer is an error, never a silent positive. Quote consent is opt-in (unticked = false).
 */
export function parseEvaluationForm(formData: FormData): ParsedEvaluation {
  const missing: string[] = [];
  const hoursRaw = String(formData.get("hoursSavedPerWeek") ?? "").trim().replace(",", ".");
  const hours = Number(hoursRaw);
  if (hoursRaw === "" || !Number.isFinite(hours) || hours < 0) missing.push("hoursSavedPerWeek");
  const satisfaction = Number(formData.get("satisfaction"));
  if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) missing.push("satisfaction");
  const stillInUse = yesNo(formData.get("stillInUse"));
  if (stillInUse === null) missing.push("stillInUse");
  const wouldRecommend = yesNo(formData.get("wouldRecommend"));
  if (wouldRecommend === null) missing.push("wouldRecommend");
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    value: {
      hoursSavedPerWeek: hours,
      satisfaction,
      stillInUse: stillInUse!,
      wouldRecommend: wouldRecommend!,
      issues: String(formData.get("issues") ?? ""),
      impactConversationId: String(formData.get("impactConversationId") ?? "") || null,
      quoteConsent: formData.get("quoteConsent") === "true",
    },
  };
}
