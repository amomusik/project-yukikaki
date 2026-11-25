"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createTeam, deliver, processTeam, transferLead } from "@/lib/teams";

export async function createTeamAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  const user = await requireRole(locale, "student");
  const { teamId, unknownEmails } = await createTeam({
    briefId: String(formData.get("briefId")),
    creatorUserId: user.id,
    name: String(formData.get("name") ?? "").trim(),
    pitch: String(formData.get("pitch") ?? "").trim(),
    memberEmails: String(formData.get("emails") ?? "").split(/[,\s]+/),
  });
  after(() => processTeam(teamId).catch((e) => console.error("[team-review]", e)));
  const q = unknownEmails.length ? `?unknown=${encodeURIComponent(unknownEmails.join(","))}` : "";
  redirect(`/${locale}/teams/${teamId}${q}`);
}

export async function transferLeadAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  const user = await requireRole(locale, "student");
  const teamId = String(formData.get("teamId"));
  await transferLead(teamId, user.id, String(formData.get("toUserId")));
  revalidatePath(`/${locale}/teams/${teamId}`);
}

export async function deliverAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  const user = await requireRole(locale, "student");
  const teamId = String(formData.get("teamId"));
  await deliver(teamId, user.id, {
    summaryJa: String(formData.get("summaryJa") ?? ""),
    summaryEn: String(formData.get("summaryEn") ?? ""),
    links: String(formData.get("links") ?? "").split(/\s+/).filter((l) => /^https?:\/\//.test(l)),
    handoverNotes: String(formData.get("handoverNotes") ?? ""),
  });
  redirect(`/${locale}/teams/${teamId}`);
}
