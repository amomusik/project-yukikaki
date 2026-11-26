import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { syncDelivery, syncTeam } from "@/lib/graph/sync";
import { withFallback } from "@/lib/integrations/_guard";
import * as dify from "@/lib/integrations/dify";
import { setBriefStatus } from "@/lib/pipeline/brief";
import { assertTransition } from "@/lib/workflow/status";

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

const SUPPORT_DAYS = 90;

export async function getLead(teamId: string) {
  const [lead] = await getDb()
    .select()
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.role, "lead")));
  return lead ?? null;
}

/** The creator becomes the lead (the business owner's point of contact). */
export async function createTeam(input: {
  briefId: string;
  creatorUserId: string;
  name: string;
  pitch: string;
  memberEmails: string[];
}): Promise<{ teamId: string; unknownEmails: string[] }> {
  const db = getDb();
  const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, input.briefId));
  if (!brief || !["approved", "in_progress"].includes(brief.status)) {
    throw new PermissionError("Teams can only form around approved challenges");
  }
  const emails = [...new Set(input.memberEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const found = emails.length
    ? await db.select().from(schema.users).where(inArray(schema.users.email, emails))
    : [];
  const students = found.filter((u) => u.role === "student" && u.id !== input.creatorUserId);
  const unknownEmails = emails.filter((e) => !students.some((u) => u.email.toLowerCase() === e));

  const teamId = await db.transaction(async (tx) => {
    const [team] = await tx
      .insert(schema.teams)
      .values({ briefId: input.briefId, name: input.name, pitch: input.pitch })
      .returning({ id: schema.teams.id });
    await tx.insert(schema.teamMembers).values([
      { teamId: team.id, userId: input.creatorUserId, role: "lead" as const },
      ...students.map((u) => ({ teamId: team.id, userId: u.id, role: "member" as const })),
    ]);
    return team.id;
  });
  return { teamId, unknownEmails };
}

/** Swap lead and member in one transaction so the one-lead index is never violated. */
export async function transferLead(teamId: string, actorUserId: string, toUserId: string) {
  const db = getDb();
  const lead = await getLead(teamId);
  if (!lead || lead.userId !== actorUserId) throw new PermissionError("Only the current lead can hand over the lead role");
  const [target] = await db
    .select()
    .from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, toUserId)));
  if (!target) throw new PermissionError("New lead must already be a team member");
  await db.transaction(async (tx) => {
    await tx
      .update(schema.teamMembers)
      .set({ role: "member" })
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, actorUserId)));
    await tx
      .update(schema.teamMembers)
      .set({ role: "lead" })
      .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, toUserId)));
  });
  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
  if (team && team.status !== "pending" && team.status !== "rejected") await syncTeam(teamId);
}

/** Lead submits the delivered solution. Lead = support contact for SUPPORT_DAYS. */
export async function deliver(
  teamId: string,
  actorUserId: string,
  input: { summaryJa: string; summaryEn: string; links: string[]; handoverNotes: string },
  now = new Date(),
) {
  const db = getDb();
  const lead = await getLead(teamId);
  if (!lead || lead.userId !== actorUserId) throw new PermissionError("Only the team lead can submit the delivery");
  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
  const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, team.briefId));
  assertTransition("team", team.status, "delivered");
  const supportUntil = new Date(now.getTime() + SUPPORT_DAYS * 86_400_000).toISOString().slice(0, 10);

  const deliveryId = await db.transaction(async (tx) => {
    const [d] = await tx
      .insert(schema.deliveries)
      .values({
        teamId,
        briefId: team.briefId,
        summary: { ja: input.summaryJa || input.summaryEn, en: input.summaryEn || input.summaryJa },
        links: input.links.filter(Boolean),
        handoverNotes: input.handoverNotes || null,
        supportContactUserId: lead.userId,
        supportUntil,
        deliveredAt: now,
      })
      .returning({ id: schema.deliveries.id });
    await tx.update(schema.teams).set({ status: "delivered", updatedAt: now }).where(eq(schema.teams.id, teamId));
    return d.id;
  });
  if (brief.status === "in_progress") await setBriefStatus(brief.id, "in_progress", "delivered");
  await syncDelivery(deliveryId);
  return { deliveryId, supportUntil };
}

/** Dify team pre-review (recommendation only). */
export async function processTeam(teamId: string, review: typeof dify.reviewTeam = dify.reviewTeam) {
  const db = getDb();
  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
  if (!team) return;
  const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, team.briefId));
  const members = await db
    .select({ name: schema.users.displayName, skills: schema.users.skills, role: schema.teamMembers.role })
    .from(schema.teamMembers)
    .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
    .where(eq(schema.teamMembers.teamId, teamId));
  const r = await withFallback(
    "dify",
    "reviewTeam",
    (signal) =>
      review(
        {
          brief: JSON.stringify({ title: brief.content.en.title, problem: brief.content.en.problem, skills_needed: brief.skillsNeeded }),
          team: JSON.stringify({ name: team.name, pitch: team.pitch }),
          members: JSON.stringify(members),
        },
        signal,
      ),
    null,
    { timeoutMs: 60_000 },
  );
  const issues: string[] = [];
  if (!members.some((m) => m.role === "lead")) issues.push("No lead named.");
  const aiReview = r.value ? dify.toAiReview(r.value) : dify.AI_REVIEW_UNAVAILABLE(r.error ?? "unknown");
  aiReview.issues = [...(aiReview.issues ?? []), ...issues];
  await db.update(schema.teams).set({ aiReview, updatedAt: new Date() }).where(eq(schema.teams.id, teamId));
}
