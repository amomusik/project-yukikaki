import "./load-env";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { closeDriver, runRead } from "@/lib/graph/client";
import { formatDateJst } from "@/lib/grants/format";
import { getGrantMatches, publishedBriefIds, refreshGrantMatches } from "@/lib/grants/store";

/**
 * Live grant matching (jGrants + optional Linkup) → grant_matches → Neo4j Funder/FUNDS.
 *   pnpm tsx scripts/grants-refresh.ts sapporo-snow-dispatch setagaya-bakery-ordering
 *   pnpm tsx scripts/grants-refresh.ts --all
 */
async function main() {
  const args = process.argv.slice(2);
  const db = getDb();
  const ids = args.includes("--all")
    ? await publishedBriefIds()
    : (await db.select({ id: schema.briefs.id }).from(schema.briefs).where(inArray(schema.briefs.slug, args))).map((r) => r.id);
  if (ids.length === 0) throw new Error("no briefs matched (pass slugs or --all)");
  let failed = 0;
  for (const id of ids) {
    const started = Date.now();
    try {
      const r = await refreshGrantMatches(id);
      const rows = await getGrantMatches(id);
      console.log(`\n■ ${id} · area ${r.prefecture ?? "全国"} · queries [${r.queries.join(", ")}] · ${r.count} matches · ${((Date.now() - started) / 1000).toFixed(1)}s`);
      for (const g of rows) {
        const amt = g.amountMax ? `≤¥${g.amountMax.toLocaleString("en-US")}` : "amount n/a";
        console.log(`  [${g.source}] ${g.score.toFixed(2)} | ${formatDateJst(g.deadline) ?? "no deadline"} | ${amt} | ${g.subsidyRate ?? "-"} | ${g.area ?? "-"} | ${g.title}`);
        console.log(`      ${g.url}`);
      }
      for (const w of r.warnings) console.log(`  ! ${w}`);
    } catch (e) {
      failed++;
      console.error(`✗ ${id}:`, e instanceof Error ? e.message : e);
    }
  }
  try {
    const [g] = await runRead<{ funders: number; edges: number }>(
      "MATCH (f:Funder {source: 'grant'})-[r:FUNDS]->(:Challenge) RETURN count(DISTINCT f) AS funders, count(r) AS edges",
    );
    console.log(`\nNeo4j: ${g?.funders ?? 0} grant Funder nodes, ${g?.edges ?? 0} FUNDS edges`);
  } catch (e) {
    console.log("\nNeo4j check failed:", e instanceof Error ? e.message : e);
  }
  await closeDriver();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
