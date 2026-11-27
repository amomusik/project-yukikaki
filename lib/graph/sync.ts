import { and, eq, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { withFallback } from "@/lib/integrations/_guard";
import { CITY_PROFILES, analogCities, findCity } from "@/lib/grounding/city-profiles";
import { industryKey } from "@/lib/grounding/industry-neighbors";
import { runWrite, type Statement } from "./client";
import {
  WIPE,
  briefStatements,
  builderStatements,
  cityAnalogStatements,
  deliveryStatements,
  teamStatements,
  type BriefGraphInput,
} from "./cypher";

/** Neon is the source of truth; these functions project rows into Neo4j. */

const PUBLISHED: (typeof schema.briefStatusEnum.enumValues)[number][] = [
  "approved",
  "in_progress",
  "delivered",
  "evaluated",
];

async function briefInput(briefId: string): Promise<BriefGraphInput | null> {
  const db = getDb();
  const [row] = await db
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(eq(schema.briefs.id, briefId));
  if (!row) return null;
  const { brief, business } = row;
  const sources = await db.select().from(schema.dataSources).where(eq(schema.dataSources.briefId, briefId));
  const ents = await db.select().from(schema.entities).where(eq(schema.entities.city, business.city));
  const ik = industryKey(business.industry);
  const relevant = ents.filter((e) => e.industries.length === 0 || e.industries.includes(ik));
  const pick = (kind: string) =>
    relevant.filter((e) => e.kind === kind).map((e) => ({ id: e.id, name: e.name.en || e.name.ja }));
  const city = findCity(business.city);
  const now = Date.now();
  const grants = (await db.select().from(schema.grantMatches).where(eq(schema.grantMatches.briefId, briefId))).filter(
    (g) => !g.deadline || g.deadline.getTime() >= now,
  );
  return {
    id: brief.id,
    titleEn: brief.content.en.title,
    titleJa: brief.content.ja.title,
    status: brief.status,
    industry: ik,
    skills: brief.skillsNeeded,
    business: { id: business.id, name: business.name, ward: business.ward },
    city: { key: city?.key ?? business.city.toLowerCase(), name: city?.en ?? business.city },
    datasets: sources.map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      level: s.groundingLevel,
      cityKey: s.matchedCity ? (findCity(s.matchedCity)?.key ?? null) : null,
    })),
    stakeholders: pick("stakeholder"),
    venues: pick("venue"),
    funders: pick("funder"),
    grants: grants.map((g) => ({
      id: `grant:${g.source}:${g.externalId}`,
      name: g.title,
      provider: g.source,
      issuer: g.issuer,
      url: g.url,
      deadline: g.deadline ? g.deadline.toISOString() : null,
      amountMax: g.amountMax,
    })),
  };
}

export async function briefSyncStatements(briefId: string): Promise<Statement[]> {
  const input = await briefInput(briefId);
  return input ? briefStatements(input) : [];
}

export async function teamSyncStatements(teamId: string): Promise<Statement[]> {
  const db = getDb();
  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
  if (!team) return [];
  const members = await db
    .select({ user: schema.users, role: schema.teamMembers.role })
    .from(schema.teamMembers)
    .innerJoin(schema.users, eq(schema.teamMembers.userId, schema.users.id))
    .where(and(eq(schema.teamMembers.teamId, teamId), or(eq(schema.teamMembers.status, "accepted"), eq(schema.teamMembers.role, "lead"))));
  const lead = members.find((m) => m.role === "lead");
  if (!lead) return [];
  return teamStatements({
    id: team.id,
    name: team.name,
    status: team.status,
    briefId: team.briefId,
    leadId: lead.user.id,
    members: members.map((m) => ({ id: m.user.id, name: m.user.displayName, skills: m.user.skills })),
  });
}

export async function deliverySyncStatements(deliveryId: string): Promise<Statement[]> {
  const [d] = await getDb().select().from(schema.deliveries).where(eq(schema.deliveries.id, deliveryId));
  return d ? deliveryStatements({ id: d.id, teamId: d.teamId, briefId: d.briefId, summaryEn: d.summary.en }) : [];
}

async function guardedWrite(operation: string, build: () => Promise<Statement[]>) {
  return withFallback(
    "neo4j",
    operation,
    async () => {
      const statements = await build();
      if (statements.length) await runWrite(statements);
      return true;
    },
    false,
  );
}

export const syncBrief = (id: string) => guardedWrite("syncBrief", () => briefSyncStatements(id));
export const syncTeam = (id: string) => guardedWrite("syncTeam", () => teamSyncStatements(id));
export const syncDelivery = (id: string) => guardedWrite("syncDelivery", () => deliverySyncStatements(id));
export const syncBuilder = (u: { id: string; displayName: string; skills: string[] }) =>
  guardedWrite("syncBuilder", async () => builderStatements({ id: u.id, name: u.displayName, skills: u.skills }));

/** Wipe Neo4j and replay every published record from Neon. Throws on failure (CLI use). */
export async function rebuildGraph(): Promise<{ challenges: number; teams: number; deliveries: number; builders: number }> {
  const db = getDb();
  const statements: Statement[] = [WIPE];
  statements.push(
    ...cityAnalogStatements(
      CITY_PROFILES.flatMap((c) =>
        analogCities(c.key, 2).map((a) => ({ from: { key: c.key, name: c.en }, to: { key: a.key, name: a.en } })),
      ),
    ),
  );
  const students = await db.select().from(schema.users).where(eq(schema.users.role, "student"));
  for (const u of students) statements.push(...builderStatements({ id: u.id, name: u.displayName, skills: u.skills }));

  const briefs = await db.select({ id: schema.briefs.id }).from(schema.briefs).where(inArray(schema.briefs.status, PUBLISHED));
  for (const b of briefs) statements.push(...(await briefSyncStatements(b.id)));

  const teams = await db
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(and(inArray(schema.teams.status, ["approved", "delivered"])));
  for (const t of teams) statements.push(...(await teamSyncStatements(t.id)));

  const deliveries = await db.select({ id: schema.deliveries.id }).from(schema.deliveries);
  for (const d of deliveries) statements.push(...(await deliverySyncStatements(d.id)));

  await runWrite(statements);
  return { challenges: briefs.length, teams: teams.length, deliveries: deliveries.length, builders: students.length };
}
