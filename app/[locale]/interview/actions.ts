"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createBriefFromDraft } from "@/lib/briefs";
import { briefDraftSchema } from "@/lib/integrations/elevenlabs";
import { processBrief } from "@/lib/pipeline/brief";
import { hasInterviewConsent } from "./consent";

/** Text fallback for the voice interview — same draft shape, same pipeline. */
export async function submitTextInterview(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  const user = await requireRole(locale, "business", "host");
  // The notice (recording, processors, retention) must be acknowledged before anything is stored.
  if (!hasInterviewConsent(formData)) redirect(`/${locale}/interview?consent=required`);
  const get = (k: string) => String(formData.get(k) ?? "");
  const draft = briefDraftSchema.parse({
    business_name: get("business_name"),
    industry: get("industry"),
    city: get("city"),
    ward: get("ward"),
    problem: get("problem"),
    current_process: get("current_process"),
    desired_outcome: get("desired_outcome"),
    tools_used: get("tools_used"),
    hours_lost_per_week: get("hours_lost_per_week"),
    data_sensitivity: get("data_sensitivity"),
    preferred_language: locale,
  });
  const { briefId } = await createBriefFromDraft(draft, { ownerUserId: user.id, businessId: get("business_id") || null });
  after(() => processBrief(briefId).catch((e) => console.error("[pipeline]", e)));
  redirect(`/${locale}/me`);
}
