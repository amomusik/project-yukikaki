import "./load-env";
import { desc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/** `tsx scripts/inspect-latest.ts` — show the newest brief's live pipeline output and recent service calls. */
(async () => {
  const db = getDb();
  const [b] = await db.select().from(schema.briefs).orderBy(desc(schema.briefs.createdAt)).limit(1);
  if (!b) return console.log("no briefs");
  console.log(`brief ${b.id.slice(0, 8)} status=${b.status} grounding=${b.groundingLevel}`);
  console.log(`  title(ja): ${b.content.ja.title}\n  title(en): ${b.content.en.title}`);
  console.log(`  ai: ${b.aiReview?.recommendation} score=${b.aiReview?.score} skills=${b.skillsNeeded.join(",")}`);
  for (const s of await db.select().from(schema.dataSources).where(eq(schema.dataSources.briefId, b.id))) {
    console.log(`  [${s.kind}/${s.provider}${s.isReference ? "/REFERENCE" : ""}${s.pending ? "/pending" : ""}] ${s.groundingLevel} ${s.matchedCity ?? ""} — ${s.title.slice(0, 70)} ${s.url ?? s.externalId ?? ""}`);
  }
  const ev = await db.select().from(schema.serviceEvents).where(gt(schema.serviceEvents.createdAt, b.createdAt)).orderBy(schema.serviceEvents.createdAt);
  const agg: Record<string, { ok: number; fail: number; err?: string }> = {};
  for (const e of ev) {
    const k = `${e.service}:${e.operation}`;
    agg[k] ??= { ok: 0, fail: 0 };
    if (e.ok) agg[k].ok++;
    else { agg[k].fail++; agg[k].err = e.error ?? ""; }
  }
  for (const [k, v] of Object.entries(agg)) console.log(`  ${k}: ${v.ok} ok, ${v.fail} failed${v.err ? ` (${v.err.slice(0, 100)})` : ""}`);
  process.exit(0);
})();
