import "./load-env";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { configured } from "@/lib/env";
import { findCity } from "@/lib/grounding/city-profiles";
import { industryKey } from "@/lib/grounding/industry-neighbors";
import { PREBAKED_DIR, loadPrebaked, prebakedSchema, type Prebaked } from "@/lib/grounding/prebaked";
import { groundBrief } from "@/lib/grounding/search";
import * as adaption from "@/lib/integrations/adaption";
import { seedSchema } from "@/lib/seed-schema";

/**
 * `pnpm prebake [--only <slug>]` — run the REAL pipeline (Linkup grounding + Adaption Labs)
 * for every seeded brief and commit the results to seed/prebaked/. These files are the
 * offline fallback, so the demo keeps working when a service is down.
 * Existing files are only replaced by a grounded result.
 */
async function main() {
  if (!configured.linkup()) {
    console.error("✗ LINKUP_API_KEY is required for prebake (existing seed/prebaked files are kept).");
    process.exit(1);
  }
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const seed = seedSchema.parse(JSON.parse(readFileSync("seed/seed.json", "utf8")));
  mkdirSync(PREBAKED_DIR, { recursive: true });

  type Job = { slug: string; out: Prebaked; datasetId?: string; datasetName?: string };
  const jobs: Job[] = [];
  const write = (j: Job) => writeFileSync(path.join(PREBAKED_DIR, `${j.slug}.json`), JSON.stringify(prebakedSchema.parse(j.out), null, 2) + "\n");

  // Phase 1 — live grounding (Linkup, official sources only) + start/reuse an Adaption dataset per brief.
  for (const brief of seed.briefs) {
    if (only && brief.slug !== only) continue;
    const biz = seed.businesses.find((b) => b.key === brief.businessKey)!;
    process.stdout.write(`• ${brief.slug} (${biz.city}, ${biz.industry}) … `);
    const g = await groundBrief({ city: biz.city, industry: biz.industry });
    if (g.unavailable || g.level === "ungrounded") {
      console.log(g.unavailable ? "Linkup unavailable — kept existing file" : "ungrounded on official sources — kept existing file");
      continue;
    }
    const previous = loadPrebaked(brief.slug);
    const job: Job = {
      slug: brief.slug,
      out: {
        slug: brief.slug,
        industry: biz.industry,
        industryKey: industryKey(biz.industry),
        city: findCity(biz.city)?.en ?? biz.city,
        groundingLevel: g.level,
        live: g.sources.map((s) => ({ title: s.title, url: s.url, snippet: s.snippet, matchedCity: s.matchedCity, level: s.level, foundBy: "linkup" as const })),
        synthetic: previous?.synthetic ?? null,
        generatedAt: new Date().toISOString(),
      },
    };
    if (configured.adaption()) {
      try {
        const spec = { briefId: `prebake-${brief.slug}`, industry: biz.industry, city: biz.city, problem: brief.content.en.problem, currentProcess: brief.content.en.current_process };
        const ds = (await adaption.findExisting(spec)) ?? (await adaption.generateGrounded(spec, g.sources));
        job.datasetId = ds.id;
        job.datasetName = ds.name;
      } catch (e) {
        console.log(`(Adaption failed: ${(e as Error).message})`);
      }
    }
    write(job);
    jobs.push(job);
    console.log(`${g.level}, ${g.sources.length} official sources${job.datasetId ? `, Adaption dataset ${job.datasetId.slice(0, 8)}…` : ""}`);
  }

  // Phase 2 — wait for all Adaption datasets in parallel and store their rows.
  const pending = jobs.filter((j) => j.datasetId);
  if (pending.length) console.log(`… waiting for ${pending.length} Adaption dataset(s)`);
  await Promise.all(
    pending.map(async (j) => {
      try {
        const rows = await adaption.waitForRows(j.datasetId!, { maxWaitMs: 25 * 60_000, intervalMs: 15_000 });
        if (rows?.length) {
          j.out.synthetic = { name: j.datasetName!, externalId: j.datasetId!, generatedBy: "adaption", rows };
          write(j);
          console.log(`✓ ${j.slug}: ${rows.length} Adaption rows`);
        } else {
          console.log(`… ${j.slug}: still generating after 25 min (dataset ${j.datasetId}); re-run prebake later`);
        }
      } catch (e) {
        console.log(`✗ ${j.slug}: ${(e as Error).message}`);
      }
    }),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
