import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { syncBrief, syncTeam } from "@/lib/graph/sync";
import { setBriefStatus } from "@/lib/pipeline/brief";
import { assertTransition } from "@/lib/workflow/status";
import { PermissionError } from "@/lib/teams";

export type Decision = "approve" | "reject";

/**
 * The ONLY path that approves/rejects briefs and teams. Dify recommends; a host decides.
 * Writes an audit row and projects approved records into the graph.
 */
export async function decide(input: {
  subjectType: "brief" | "team";
  subjectId: string;
  decision: Decision;
  note?: string | null;
  hostUserId: string;
}) {
  const db = getDb();
  const [host] = await db.select().from(schema.users).where(eq(schema.users.id, input.hostUserId));
  if (!host || host.role !== "host") throw new PermissionError("Only a town host can make decisions");

  if (input.subjectType === "brief") {
    const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, input.subjectId));
    if (!brief) throw new Error("Brief not found");
    const to = input.decision === "approve" ? "approved" : "rejected";
    await setBriefStatus(brief.id, brief.status, to);
    await audit(input);
    if (to === "approved") await syncBrief(brief.id);
    return { status: to };
  }

  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, input.subjectId));
  if (!team) throw new Error("Team not found");
  const to = input.decision === "approve" ? "approved" : "rejected";
  assertTransition("team", team.status, to);
  await db.update(schema.teams).set({ status: to, updatedAt: new Date() }).where(eq(schema.teams.id, team.id));
  await audit(input);
  if (to === "approved") {
    const [brief] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, team.briefId));
    if (brief.status === "approved") await setBriefStatus(brief.id, "approved", "in_progress");
    await syncTeam(team.id);
    await syncBrief(brief.id); // status changed
  }
  return { status: to };
}

async function audit(input: { subjectType: "brief" | "team"; subjectId: string; decision: Decision; note?: string | null; hostUserId: string }) {
  await getDb().insert(schema.decisions).values({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    decision: input.decision,
    note: input.note || null,
    decidedBy: input.hostUserId,
  });
}

/** Rejected briefs can be resubmitted to the queue after edits. */
export async function resubmitBrief(briefId: string) {
  const [brief] = await getDb().select().from(schema.briefs).where(eq(schema.briefs.id, briefId));
  if (!brief) throw new Error("Brief not found");
  await setBriefStatus(brief.id, brief.status, "in_review");
}
