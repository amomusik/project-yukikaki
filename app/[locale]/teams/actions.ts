"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createTeam, deliver, processTeam, respondToInvite, transferLead } from "@/lib/teams";
import { isUuid } from "@/lib/uuid";

export async function createTeamAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  const user = await requireRole(locale, "student");
  const { teamId } = await createTeam({
    briefId: String(formData.get("briefId")),
    creatorUserId: user.id,
    name: String(formData.get("name") ?? "").trim(),
    pitch: String(formData.get("pitch") ?? "").trim(),
    memberEmails: String(formData.get("emails") ?? "").split(/[,\s]+/),
  });
  // No invite e-mail yet (lib/integrations/email.ts has no team-invite template): invitees see
  // the invitation under My page and accept or decline on the team page.
  after(() => processTeam(teamId).catch((e) => console.error("[team-review]", e)));
  // Same message whether or not any email matched a builder account.
  redirect(`/${locale}/teams/${teamId}?invited=1`);
}

/** Invitee accepts or declines; an accepted member triggers a fresh AI pre-review of a pending team. */
export async function respondToInviteAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  const user = await requireRole(locale, "student");
  const teamId = String(formData.get("teamId"));
  if (!isUuid(teamId)) return;
  const accept = formData.get("response") === "accept";
  const status = await respondToInvite(teamId, user.id, accept);
  if (status === "accepted") {
    const [team] = await getDb().select().from(schema.teams).where(eq(schema.teams.id, teamId));
    if (team?.status === "pending") after(() => processTeam(teamId).catch((e) => console.error("[team-review]", e)));
  }
  revalidatePath(`/${locale}/teams/${teamId}`);
  revalidatePath(`/${locale}/me`);
  if (status === "declined") redirect(`/${locale}/me`);
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
