import "./load-env";
import { readFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { saveSynthetic } from "@/lib/datasets/store";
import { loadPrebaked } from "@/lib/grounding/prebaked";
import { rebuildGraph } from "@/lib/graph/sync";
import { configured } from "@/lib/env";
import { seedSchema } from "@/lib/seed-schema";

/**
 * `pnpm seed` — load synthetic demo content (seed/seed.json + seed/prebaked/*.json).
 * Only rows flagged is_synthetic are replaced; real records are never touched.
 */
async function wipeSynthetic() {
  const db = getDb();
  const synthUsers = (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isSynthetic, true))).map((r) => r.id);
  const synthBriefs = (await db.select({ id: schema.briefs.id }).from(schema.briefs).where(eq(schema.briefs.isSynthetic, true))).map((r) => r.id);
  if (synthBriefs.length) {
    const teams = (await db.select({ id: schema.teams.id }).from(schema.teams).where(inArray(schema.teams.briefId, synthBriefs))).map((r) => r.id);
    const deliveries = (await db.select({ id: schema.deliveries.id }).from(schema.deliveries).where(inArray(schema.deliveries.briefId, synthBriefs))).map((r) => r.id);
    if (deliveries.length) {
      await db.delete(schema.evaluations).where(inArray(schema.evaluations.deliveryId, deliveries));
      await db.delete(schema.feedbackTokens).where(inArray(schema.feedbackTokens.deliveryId, deliveries));
      await db.delete(schema.deliveries).where(inArray(schema.deliveries.id, deliveries));
    }
    if (teams.length) {
      await db.delete(schema.decisions).where(inArray(schema.decisions.subjectId, teams));
      await db.delete(schema.teamMembers).where(inArray(schema.teamMembers.teamId, teams));
      await db.delete(schema.teams).where(inArray(schema.teams.id, teams));
    }
    await db.delete(schema.decisions).where(inArray(schema.decisions.subjectId, synthBriefs));
    await db.delete(schema.dataSources).where(inArray(schema.dataSources.briefId, synthBriefs));
    await db.delete(schema.briefs).where(inArray(schema.briefs.id, synthBriefs));
  }
  await db.delete(schema.businesses).where(eq(schema.businesses.isSynthetic, true));
  if (synthUsers.length) {
    await db.delete(schema.teamMembers).where(inArray(schema.teamMembers.userId, synthUsers));
    await db.delete(schema.users).where(inArray(schema.users.id, synthUsers));
  }
  await db.delete(schema.entities);
}

async function main() {
  const seed = seedSchema.parse(JSON.parse(readFileSync("seed/seed.json", "utf8")));
  const db = getDb();
  await wipeSynthetic();

  const userId = new Map<string, string>();
  for (const u of seed.users) {
    const [row] = await db
      .insert(schema.users)
      .values({ clerkId: `seed_${u.key}`, role: u.role, displayName: u.displayName, email: u.email.toLowerCase(), skills: u.skills, isSynthetic: true })
      .returning({ id: schema.users.id });
    userId.set(u.key, row.id);
  }

  const businessId = new Map<string, string>();
  for (const b of seed.businesses) {
    const [row] = await db
      .insert(schema.businesses)
      .values({ ownerUserId: userId.get(b.ownerKey)!, name: b.name, city: b.city, ward: b.ward, industry: b.industry, isSynthetic: true })
      .returning({ id: schema.businesses.id });
    businessId.set(b.key, row.id);
  }

  const briefId = new Map<string, string>();
  let sources = 0;
  for (const b of seed.briefs) {
    const pre = loadPrebaked(b.slug);
    const [row] = await db
      .insert(schema.briefs)
      .values({
        slug: b.slug,
        businessId: businessId.get(b.businessKey)!,
        content: b.content,
        transcript: b.transcript,
        toolsUsed: b.toolsUsed,
        hoursLostPerWeek: b.hoursLostPerWeek,
        skillsNeeded: b.skillsNeeded,
        dataSensitivity: b.dataSensitivity,
        groundingLevel: pre?.groundingLevel ?? "ungrounded",
        status: b.status,
        aiReview: b.aiReview,
        isSynthetic: true,
      })
      .returning({ id: schema.briefs.id });
    briefId.set(b.slug, row.id);
    if (!pre) continue;
    const live = pre.live.length
      ? await db
          .insert(schema.dataSources)
          .values(
            pre.live.map((s) => ({
              briefId: row.id,
              kind: "live" as const,
              provider: s.foundBy === "linkup" ? ("linkup" as const) : ("manual" as const),
              groundingLevel: s.level,
              matchedCity: s.matchedCity,
              title: s.title,
              url: s.url,
              snippet: s.snippet,
            })),
          )
          .returning({ id: schema.dataSources.id })
      : [];
    sources += live.length;
    if (pre.synthetic) {
      const [ds] = await db
        .insert(schema.dataSources)
        .values({
          briefId: row.id,
          kind: "synthetic",
          provider: pre.synthetic.generatedBy === "adaption" ? "adaption" : "prebaked",
          groundingLevel: pre.groundingLevel,
          title: `${pre.synthetic.generatedBy === "adaption" ? "Adaption Labs" : "Seed"}: ${pre.synthetic.name}`,
          snippet: `${pre.synthetic.rows.length} example rows`,
          groundedOn: live.map((l) => l.id),
          externalId: pre.synthetic.externalId ?? null,
        })
        .returning({ id: schema.dataSources.id });
      await saveSynthetic(ds.id, {
        name: pre.synthetic.name,
        generatedBy: pre.synthetic.generatedBy === "adaption" ? "adaption" : "seed",
        externalId: pre.synthetic.externalId ?? null,
        groundedOn: pre.live.map((l) => ({ title: l.title, url: l.url })),
        rows: pre.synthetic.rows,
      });
      sources += 1;
    }
  }

  const teamId = new Map<string, string>();
  const teamLead = new Map<string, string>();
  for (const t of seed.teams) {
    const [row] = await db
      .insert(schema.teams)
      .values({ briefId: briefId.get(t.briefSlug)!, name: t.name, pitch: t.pitch, status: t.status })
      .returning({ id: schema.teams.id });
    teamId.set(t.key, row.id);
    teamLead.set(t.key, userId.get(t.leadKey)!);
    await db.insert(schema.teamMembers).values([
      // Demo teams: every seeded member has accepted their invitation.
      { teamId: row.id, userId: userId.get(t.leadKey)!, role: "lead" as const, status: "accepted" as const },
      ...t.memberKeys.map((k) => ({ teamId: row.id, userId: userId.get(k)!, role: "member" as const, status: "accepted" as const })),
    ]);
  }

  const deliveryByTeam = new Map<string, string>();
  for (const d of seed.deliveries) {
    const team = seed.teams.find((t) => t.key === d.teamKey)!;
    const deliveredAt = new Date(d.deliveredAt);
    const [row] = await db
      .insert(schema.deliveries)
      .values({
        teamId: teamId.get(d.teamKey)!,
        briefId: briefId.get(team.briefSlug)!,
        summary: d.summary,
        links: d.links,
        handoverNotes: d.handoverNotes,
        supportContactUserId: teamLead.get(d.teamKey)!,
        supportUntil: new Date(deliveredAt.getTime() + 90 * 86_400_000).toISOString().slice(0, 10),
        deliveredAt,
      })
      .returning({ id: schema.deliveries.id });
    deliveryByTeam.set(d.teamKey, row.id);
  }

  for (const e of seed.evaluations) {
    await db.insert(schema.evaluations).values({
      deliveryId: deliveryByTeam.get(e.teamKey)!,
      hoursSavedPerWeek: e.hoursSavedPerWeek,
      satisfaction: e.satisfaction,
      stillInUse: e.stillInUse,
      issues: e.issues || null,
      wouldRecommend: e.wouldRecommend,
      impactSummary: { quote: e.quote },
    });
  }

  if (seed.entities.length) await db.insert(schema.entities).values(seed.entities);

  console.log(
    `✓ seeded ${seed.users.length} users, ${seed.businesses.length} businesses, ${seed.briefs.length} briefs, ${sources} data sources, ` +
      `${seed.teams.length} teams, ${seed.deliveries.length} deliveries, ${seed.evaluations.length} evaluations, ${seed.entities.length} entities`,
  );

  if (configured.neo4j()) {
    try {
      const r = await rebuildGraph();
      console.log(`✓ graph rebuilt: ${r.challenges} challenges, ${r.teams} teams, ${r.deliveries} deliveries, ${r.builders} builders`);
    } catch (e) {
      console.warn(`! graph rebuild failed (app still works; graph panels show "unavailable"): ${(e as Error).message}`);
    }
  } else {
    console.log("· Neo4j not configured — skipped graph rebuild");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
