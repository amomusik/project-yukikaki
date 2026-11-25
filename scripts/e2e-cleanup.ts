import { inArray, like, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Remove everything created by E2E test users (emails ending in +clerk_test@example.com)
 * so repeated runs against a shared database (Neon) start clean. Demo seed data is untouched.
 */
export async function cleanupE2E(): Promise<number> {
  const db = getDb();
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, "%+clerk_test@example.com"));
  const userIds = users.map((u) => u.id);
  if (!userIds.length) return 0;
  const bizIds = (await db.select({ id: schema.businesses.id }).from(schema.businesses).where(inArray(schema.businesses.ownerUserId, userIds))).map((r) => r.id);
  const briefIds = bizIds.length ? (await db.select({ id: schema.briefs.id }).from(schema.briefs).where(inArray(schema.briefs.businessId, bizIds))).map((r) => r.id) : [];
  const memberTeams = (await db.select({ id: schema.teamMembers.teamId }).from(schema.teamMembers).where(inArray(schema.teamMembers.userId, userIds))).map((r) => r.id);
  const briefTeams = briefIds.length ? (await db.select({ id: schema.teams.id }).from(schema.teams).where(inArray(schema.teams.briefId, briefIds))).map((r) => r.id) : [];
  const teamIds = [...new Set([...memberTeams, ...briefTeams])];
  const deliveryIds = teamIds.length || briefIds.length
    ? (await db.select({ id: schema.deliveries.id }).from(schema.deliveries).where(or(teamIds.length ? inArray(schema.deliveries.teamId, teamIds) : undefined, briefIds.length ? inArray(schema.deliveries.briefId, briefIds) : undefined))).map((r) => r.id)
    : [];
  if (deliveryIds.length) {
    await db.delete(schema.evaluations).where(inArray(schema.evaluations.deliveryId, deliveryIds));
    await db.delete(schema.feedbackTokens).where(inArray(schema.feedbackTokens.deliveryId, deliveryIds));
    await db.delete(schema.deliveries).where(inArray(schema.deliveries.id, deliveryIds));
  }
  if (teamIds.length) {
    await db.delete(schema.teamMembers).where(inArray(schema.teamMembers.teamId, teamIds));
    await db.delete(schema.decisions).where(inArray(schema.decisions.subjectId, teamIds));
    await db.delete(schema.teams).where(inArray(schema.teams.id, teamIds));
  }
  if (briefIds.length) {
    await db.delete(schema.decisions).where(inArray(schema.decisions.subjectId, briefIds));
    await db.delete(schema.dataSources).where(inArray(schema.dataSources.briefId, briefIds));
    await db.delete(schema.briefs).where(inArray(schema.briefs.id, briefIds));
  }
  if (bizIds.length) await db.delete(schema.businesses).where(inArray(schema.businesses.id, bizIds));
  await db.delete(schema.decisions).where(inArray(schema.decisions.decidedBy, userIds));
  return briefIds.length;
}
