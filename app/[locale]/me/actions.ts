"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireRole } from "@/lib/auth";
import { BRIEF_TEXT_FIELDS, resubmitBrief, type BriefEdits } from "@/lib/decide";
import { reEnrichBrief, startReEnrichment } from "@/lib/pipeline/brief";
import { PermissionError } from "@/lib/teams";
import { isUuid } from "@/lib/uuid";
import { TransitionError } from "@/lib/workflow/status";

/**
 * Owner: revise a returned (rejected) brief and send it back to the host queue.
 * rejected → in_review, then enrichment re-runs in the background (in_review → enriching → in_review)
 * so grounding and the AI pre-review reflect the edited text.
 */
export async function resubmitBriefAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja") === "en" ? "en" : "ja";
  const user = await requireRole(locale, "business");
  const briefId = String(formData.get("briefId") ?? "");
  if (!isUuid(briefId)) redirect(`/${locale}/me`);
  const edits: BriefEdits = Object.fromEntries(BRIEF_TEXT_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]));
  try {
    await resubmitBrief(briefId, { ownerUserId: user.id, edits, lang: locale });
  } catch (e) {
    if (e instanceof PermissionError || e instanceof TransitionError) redirect(`/${locale}/me?resubmit=error`);
    throw e;
  }
  if (await startReEnrichment(briefId)) {
    after(() => reEnrichBrief(briefId, {}, { alreadyStarted: true }).catch((e) => console.error("[resubmit re-enrich]", e)));
  }
  revalidatePath(`/${locale}/me`);
  revalidatePath(`/${locale}/admin`);
  redirect(`/${locale}/me?resubmit=ok`);
}
