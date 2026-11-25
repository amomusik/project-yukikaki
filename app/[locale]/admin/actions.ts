"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireRole } from "@/lib/auth";
import { decide } from "@/lib/decide";
import { sendImpactCheck } from "@/lib/feedback";
import { rebuildGraph } from "@/lib/graph/sync";
import { scheduleGrantRefresh } from "@/lib/grants/schedule";
import { withFallback } from "@/lib/integrations/_guard";
import { reEnrichBrief, startReEnrichment } from "@/lib/pipeline/brief";

export async function decideAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  const host = await requireRole(locale, "host");
  const subjectType = formData.get("subjectType") === "team" ? "team" : "brief";
  const subjectId = String(formData.get("subjectId"));
  const decision = formData.get("decision") === "approve" ? "approve" : "reject";
  await decide({
    subjectType,
    subjectId,
    decision,
    note: String(formData.get("note") ?? "") || null,
    hostUserId: host.id,
  });
  // Newly published challenge: match open public funding programmes in the background.
  if (subjectType === "brief" && decision === "approve") scheduleGrantRefresh(subjectId);
  revalidatePath(`/${locale}/admin`);
}

export type ImpactResult = { link: string; emailed: boolean; to: string | null } | { error: string };

export async function sendImpactCheckAction(_: ImpactResult | null, formData: FormData): Promise<ImpactResult> {
  const locale = String(formData.get("locale") ?? "ja") as "ja" | "en";
  await requireRole(locale, "host");
  try {
    const r = await sendImpactCheck(String(formData.get("deliveryId")), locale);
    revalidatePath(`/${locale}/admin`);
    return r;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function rebuildGraphAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  await requireRole(locale, "host");
  await withFallback("neo4j", "rebuildGraph", () => rebuildGraph(), null, { timeoutMs: 60_000 });
  revalidatePath(`/${locale}/admin/graph`);
}

/** Host: re-run grounding + Adaption + Dify for a brief in review (in_review → enriching → in_review). */
export async function reEnrichAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  await requireRole(locale, "host");
  const briefId = String(formData.get("briefId") ?? "");
  if (!briefId) return;
  if (await startReEnrichment(briefId)) {
    after(() => reEnrichBrief(briefId, {}, { alreadyStarted: true }).catch((e) => console.error("[re-enrich]", e)));
  }
  revalidatePath(`/${locale}/admin`);
}
