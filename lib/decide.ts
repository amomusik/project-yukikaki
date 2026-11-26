import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { BriefContent } from "@/lib/db/schema";
import { syncBrief, syncTeam } from "@/lib/graph/sync";
import { setBriefStatus } from "@/lib/pipeline/brief";
import { assertTransition, TransitionError } from "@/lib/workflow/status";
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

export const BRIEF_TEXT_FIELDS = ["title", "problem", "current_process", "desired_outcome"] as const;
export type BriefTextField = (typeof BRIEF_TEXT_FIELDS)[number];
export type BriefEdits = Partial<Record<BriefTextField, string>>;
const MAX_LEN: Record<BriefTextField, number> = { title: 120, problem: 4000, current_process: 4000, desired_outcome: 4000 };

/**
 * Apply an owner's edits to one language. A field the owner changed is also copied into the other
 * language (as the draft does) so the re-run Dify editor translates the new text, not the stale one.
 * Blank or unchanged fields are ignored. Pure; exported for tests.
 */
export function applyBriefEdits(content: BriefContent, edits: BriefEdits, lang: "ja" | "en"): { content: BriefContent; changed: BriefTextField[] } {
  const other = lang === "ja" ? "en" : "ja";
  const next: BriefContent = { ja: { ...content.ja }, en: { ...content.en } };
  const changed: BriefTextField[] = [];
  for (const f of BRIEF_TEXT_FIELDS) {
    const v = edits[f]?.trim().slice(0, MAX_LEN[f]);
    if (!v || v === content[lang]?.[f]) continue;
    next[lang][f] = v;
    next[other][f] = v;
    changed.push(f);
  }
  return { content: next, changed };
}

/**
 * Rejected briefs can be resubmitted to the queue after edits: rejected → in_review.
 * With `ownerUserId`, only the business owner may resubmit. The status change is conditional on the
 * brief still being rejected, so a double submit cannot resubmit twice. Callers then re-run
 * enrichment (startReEnrichment + reEnrichBrief) so grounding and the AI pre-review see the new text.
 */
export async function resubmitBrief(
  briefId: string,
  opts: { ownerUserId?: string; edits?: BriefEdits; lang?: "ja" | "en" } = {},
): Promise<{ changed: BriefTextField[] }> {
  const db = getDb();
  const [row] = await db
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(eq(schema.briefs.id, briefId));
  if (!row) throw new Error("Brief not found");
  const { brief, business } = row;
  if (opts.ownerUserId && business.ownerUserId !== opts.ownerUserId) throw new PermissionError("Only the business owner can resubmit this brief");
  assertTransition("brief", brief.status, "in_review");
  const { content, changed } = opts.edits ? applyBriefEdits(brief.content, opts.edits, opts.lang ?? "ja") : { content: brief.content, changed: [] };
  const rows = await db
    .update(schema.briefs)
    .set({ status: "in_review", content, updatedAt: new Date() })
    .where(and(eq(schema.briefs.id, brief.id), eq(schema.briefs.status, "rejected")))
    .returning({ id: schema.briefs.id });
  if (rows.length === 0) throw new TransitionError("brief", brief.status, "in_review"); // lost a race
  return { changed };
}
