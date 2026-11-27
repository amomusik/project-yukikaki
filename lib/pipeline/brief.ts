import { and, eq, inArray, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { AiReview, BriefStatus, GroundingLevel } from "@/lib/db/schema";
import { saveSynthetic } from "@/lib/datasets/store";
import { findClosestPrebaked, loadPrebaked, PREBAKED_DIR, type Prebaked } from "@/lib/grounding/prebaked";
import { defaultSearch, groundBrief, type GroundingSource, type SearchFn } from "@/lib/grounding/search";
import { withFallback } from "@/lib/integrations/_guard";
import * as adaption from "@/lib/integrations/adaption";
import * as dify from "@/lib/integrations/dify";
import { inferSkills } from "@/lib/skills";
import { assertTransition, STUCK_AFTER_MS } from "@/lib/workflow/status";
import { requireLiveServices } from "@/lib/env";

export type PipelineDeps = {
  search: SearchFn;
  findExisting: typeof adaption.findExisting;
  generateGrounded: typeof adaption.generateGrounded;
  waitForRows: typeof adaption.waitForRows;
  reviewBrief: typeof dify.reviewBrief;
  prebakedDir: string;
  adaptionWaitMs: number;
  /** Live-only mode: never substitute pre-baked/reference data for a failed live call. */
  liveOnly: boolean;
};

const defaults: PipelineDeps = {
  search: defaultSearch,
  findExisting: adaption.findExisting,
  generateGrounded: adaption.generateGrounded,
  waitForRows: adaption.waitForRows,
  reviewBrief: dify.reviewBrief,
  prebakedDir: PREBAKED_DIR,
  adaptionWaitMs: 25_000,
  liveOnly: requireLiveServices(),
};

export async function setBriefStatus(id: string, from: BriefStatus, to: BriefStatus) {
  assertTransition("brief", from, to);
  await getDb()
    .update(schema.briefs)
    .set({ status: to, updatedAt: new Date() })
    .where(eq(schema.briefs.id, id));
}

/**
 * Host action: claim a brief for (re-)enrichment. Atomic (conditional on the current status),
 * so double-clicks can't start two runs. Claims either
 *   - a brief in review: in_review → enriching (Re-run enrichment), or
 *   - a stuck brief: draft/enriching untouched for STUCK_AFTER_MS → enriching (Retry). The
 *     updatedAt bump means a second click within the window can't start a parallel run.
 * Returns false if the brief is in neither state.
 */
export async function startReEnrichment(briefId: string, now: Date = new Date()): Promise<boolean> {
  assertTransition("brief", "in_review", "enriching");
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS);
  const rows = await getDb()
    .update(schema.briefs)
    .set({ status: "enriching", updatedAt: now })
    .where(
      and(
        eq(schema.briefs.id, briefId),
        or(
          eq(schema.briefs.status, "in_review"),
          and(inArray(schema.briefs.status, ["draft", "enriching"]), lt(schema.briefs.updatedAt, stuckBefore)),
        ),
      ),
    )
    .returning({ id: schema.briefs.id });
  return rows.length > 0;
}

/**
 * Re-run grounding + Adaption + Dify for a brief already in review (e.g. after a live-only
 * failure) or stuck in draft/enriching: → enriching → in_review. processBrief always lands
 * the brief in in_review, including when a step fails.
 * Pass `alreadyStarted` when startReEnrichment() was called separately.
 */
export async function reEnrichBrief(
  briefId: string,
  overrides: Partial<PipelineDeps> = {},
  opts: { alreadyStarted?: boolean } = {},
): Promise<boolean> {
  if (!opts.alreadyStarted && !(await startReEnrichment(briefId))) return false;
  await processBrief(briefId, overrides);
  return true;
}

type LiveRow = { id: string; title: string; url: string; snippet: string };

/**
 * draft → enriching → (grounding, stand-in data, AI review) → in_review.
 * Every external step is guarded, so the brief ALWAYS lands in the host's queue.
 */
export async function processBrief(briefId: string, overrides: Partial<PipelineDeps> = {}): Promise<void> {
  const deps = { ...defaults, ...overrides };
  const db = getDb();
  const [row] = await db
    .select({ brief: schema.briefs, business: schema.businesses })
    .from(schema.briefs)
    .innerJoin(schema.businesses, eq(schema.briefs.businessId, schema.businesses.id))
    .where(eq(schema.briefs.id, briefId));
  if (!row) throw new Error(`Brief ${briefId} not found`);
  const { brief, business } = row;
  if (brief.status !== "draft" && brief.status !== "enriching") return; // already processed
  if (brief.status === "draft") await setBriefStatus(briefId, "draft", "enriching");

  let level: GroundingLevel = "ungrounded";
  let aiReview: AiReview = dify.AI_REVIEW_UNAVAILABLE("not run");
  const issues: string[] = [];

  try {
    await db.delete(schema.dataSources).where(eq(schema.dataSources.briefId, briefId)); // idempotent re-run

    /* 1. Grounding (Linkup cascade), or pre-baked reference data if Linkup is unreachable. */
    const grounding = await groundBrief({ city: business.city, industry: business.industry }, { search: deps.search });
    let live: LiveRow[] = [];
    let prebaked: Prebaked | null = null;

    if (grounding.unavailable && deps.liveOnly) {
      issues.push("Linkup search failed (live-only mode): no grounding yet. Re-run enrichment once Linkup is reachable.");
    } else if (grounding.unavailable) {
      const own = brief.slug ? loadPrebaked(brief.slug, deps.prebakedDir) : null;
      prebaked = own ?? findClosestPrebaked(business.industry, deps.prebakedDir);
      if (prebaked && prebaked.groundingLevel !== "ungrounded") {
        const isReference = !own;
        level = prebaked.groundingLevel;
        live = await insertLive(
          briefId,
          prebaked.live.map((s) => ({ ...s, query: "prebaked" })),
          { provider: "prebaked", isReference },
        );
        if (isReference) issues.push("Linkup unavailable: showing pre-fetched reference data from a similar business.");
      } else {
        issues.push("Linkup unavailable and no pre-baked data for this industry.");
      }
    } else if (grounding.level !== "ungrounded") {
      level = grounding.level;
      live = await insertLive(briefId, grounding.sources, { provider: "linkup", isReference: false });
    }
    if (level === "ungrounded") issues.push("Ungrounded: no real-world sources found; no synthetic data generated.");

    /* 2. Stand-in data (Adaption Labs) — only when grounded. Reuse first, then generate. */
    if (level !== "ungrounded") {
      if (prebaked) {
        await insertPrebakedSynthetic(briefId, prebaked, live, prebaked.slug !== brief.slug);
      } else {
        const spec: adaption.StandInSpec = {
          briefId,
          industry: business.industry,
          city: business.city,
          problem: brief.content.en.problem || brief.content.ja.problem,
          currentProcess: brief.content.en.current_process || brief.content.ja.current_process,
        };
        const r = await withFallback(
          "adaption",
          "standIn",
          async (signal) => {
            const existing = await deps.findExisting(spec, signal);
            const ds = existing ?? (await deps.generateGrounded(spec, live, signal));
            const rows = await deps.waitForRows(ds.id, { maxWaitMs: existing ? 10_000 : deps.adaptionWaitMs, signal });
            return { ...ds, rows, reused: Boolean(existing) };
          },
          null,
          { timeoutMs: deps.adaptionWaitMs + 20_000 },
        );
        if (r.value) {
          const [ds] = await db
            .insert(schema.dataSources)
            .values({
              briefId,
              kind: "synthetic",
              provider: "adaption",
              groundingLevel: level,
              title: r.value.reused ? `Adaption Labs (reused): ${r.value.name}` : `Adaption Labs: ${r.value.name}`,
              snippet: r.value.rows ? `${r.value.rows.length} example rows` : "Generating…",
              groundedOn: live.map((l) => l.id),
              externalId: r.value.id,
              pending: r.value.rows === null,
            })
            .returning();
          if (r.value.rows) {
            await saveSynthetic(ds.id, {
              name: r.value.name,
              generatedBy: "adaption",
              externalId: r.value.id,
              groundedOn: live.map((l) => ({ title: l.title, url: l.url })),
              rows: r.value.rows,
            });
          }
        } else {
          const ref = deps.liveOnly ? null : findClosestPrebaked(business.industry, deps.prebakedDir);
          if (ref?.synthetic) {
            await insertPrebakedSynthetic(briefId, ref, live, true);
            issues.push("Adaption Labs unavailable: showing pre-fetched reference stand-in data.");
          } else {
            issues.push(`Adaption Labs call failed${deps.liveOnly ? " (live-only mode)" : ""}: no stand-in data yet.`);
          }
        }
      }
    }

    /* 3. AI pre-review (Dify). Recommends only; never changes status. */
    const sourcesText = live.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}\n${s.snippet}`).join("\n\n");
    const review = await withFallback(
      "dify",
      "reviewBrief",
      (signal) =>
        deps.reviewBrief(
          {
            content: brief.content,
            transcript: brief.transcript ?? "",
            sources: sourcesText || "(none)",
            groundingLevel: level,
            meta: JSON.stringify({
              business: business.name,
              city: business.city,
              industry: business.industry,
              hours_lost_per_week: brief.hoursLostPerWeek,
              tools_used: brief.toolsUsed,
              data_sensitivity: brief.dataSensitivity,
            }),
          },
          signal,
        ),
      null,
      { timeoutMs: 60_000 },
    );
    const update: Partial<typeof schema.briefs.$inferInsert> = {};
    if (review.value) {
      aiReview = dify.toAiReview(review.value);
      if (review.value.normalized) update.content = review.value.normalized;
      if (review.value.skills_needed.length) update.skillsNeeded = review.value.skills_needed;
    } else {
      aiReview = dify.AI_REVIEW_UNAVAILABLE(review.error ?? "unknown");
    }
    if (!update.skillsNeeded && brief.skillsNeeded.length === 0) {
      update.skillsNeeded = inferSkills(brief.content.ja.problem, brief.content.en.problem, brief.toolsUsed);
    }
    await db.update(schema.briefs).set(update).where(eq(schema.briefs.id, briefId));
  } catch (err) {
    aiReview = dify.AI_REVIEW_UNAVAILABLE(err instanceof Error ? err.message : String(err));
  } finally {
    aiReview = { ...aiReview, issues: [...(aiReview.issues ?? []), ...issues] };
    await db
      .update(schema.briefs)
      .set({ aiReview, groundingLevel: level, updatedAt: new Date() })
      .where(eq(schema.briefs.id, briefId));
    await setBriefStatus(briefId, "enriching", "in_review");
  }
}

async function insertLive(
  briefId: string,
  sources: (Pick<GroundingSource, "title" | "url" | "snippet" | "level" | "matchedCity"> & { query?: string })[],
  opts: { provider: "linkup" | "prebaked"; isReference: boolean },
): Promise<LiveRow[]> {
  if (sources.length === 0) return [];
  const rows = await getDb()
    .insert(schema.dataSources)
    .values(
      sources.map((s) => ({
        briefId,
        kind: "live" as const,
        provider: opts.provider,
        groundingLevel: s.level,
        matchedCity: s.matchedCity,
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        isReference: opts.isReference,
      })),
    )
    .returning();
  return rows.map((r) => ({ id: r.id, title: r.title, url: r.url ?? "", snippet: r.snippet ?? "" }));
}

async function insertPrebakedSynthetic(briefId: string, p: Prebaked, live: LiveRow[], isReference: boolean) {
  if (!p.synthetic) return;
  const db = getDb();
  const [ds] = await db
    .insert(schema.dataSources)
    .values({
      briefId,
      kind: "synthetic",
      provider: "prebaked",
      groundingLevel: p.groundingLevel,
      title: `${p.synthetic.generatedBy === "adaption" ? "Adaption Labs" : "Seed"}: ${p.synthetic.name}`,
      snippet: `${p.synthetic.rows.length} example rows`,
      groundedOn: live.map((l) => l.id),
      externalId: p.synthetic.externalId ?? null,
      isReference,
    })
    .returning();
  await saveSynthetic(ds.id, {
    name: p.synthetic.name,
    generatedBy: p.synthetic.generatedBy === "adaption" ? "adaption" : "seed",
    externalId: p.synthetic.externalId ?? null,
    groundedOn: p.live.map((l) => ({ title: l.title, url: l.url })),
    rows: p.synthetic.rows,
  });
}

/** Lazily finish an Adaption dataset that was still generating when the pipeline ran. */
export async function refreshPendingDataset(dataSourceId: string): Promise<boolean> {
  const db = getDb();
  const [ds] = await db.select().from(schema.dataSources).where(eq(schema.dataSources.id, dataSourceId));
  if (!ds || !ds.pending || !ds.externalId) return false;
  const r = await withFallback(
    "adaption",
    "refreshPending",
    (signal) => adaption.waitForRows(ds.externalId!, { maxWaitMs: 1, signal }),
    null,
  );
  if (!r.value) return false;
  const live = await db.select().from(schema.dataSources).where(eq(schema.dataSources.briefId, ds.briefId));
  await saveSynthetic(
    ds.id,
    {
      name: ds.title,
      generatedBy: "adaption",
      externalId: ds.externalId,
      groundedOn: live.filter((l) => ds.groundedOn.includes(l.id)).map((l) => ({ title: l.title, url: l.url ?? "" })),
      rows: r.value,
    },
    { pending: false, snippet: `${r.value.length} example rows` },
  );
  return true;
}
