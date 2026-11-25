import { z } from "zod";
import { configured, env } from "@/lib/env";
import { findCity } from "@/lib/grounding/city-profiles";
import { industryKey } from "@/lib/grounding/industry-neighbors";
import { fetchJson, NotConfiguredError } from "./_guard";

/**
 * Adaption Labs (Adaptive Data) — https://docs.adaptionlabs.ai/api/
 * We use it for *stand-in data*: realistic Japanese example interactions for a
 * business type (prompt = incoming message/task, completion = ideal handling),
 * which students use to build and test automations without touching private data.
 *
 * Rule: we never invent data without grounding. generateGrounded() refuses to run
 * without at least one live source, and the sources are woven into the prompt.
 */

export type StandInSpec = {
  briefId: string;
  industry: string;
  city: string;
  problem: string;
  currentProcess?: string;
};
export type StandInRow = { prompt: string; completion: string };
export type GroundingFact = { title: string; url: string; snippet: string };

export class UngroundedError extends Error {
  constructor() {
    super("Refusing to generate synthetic data without at least one grounding source");
    this.name = "UngroundedError";
  }
}

const headers = () => ({
  Authorization: `Bearer ${env.ADAPTION_API_KEY}`,
  "Content-Type": "application/json",
});
const base = () => env.ADAPTION_API_URL.replace(/\/$/, "");

/** Stable, searchable name so later briefs can reuse earlier datasets. */
export function datasetName(spec: Pick<StandInSpec, "industry" | "city">): string {
  const city = findCity(spec.city)?.key ?? spec.city.trim().toLowerCase();
  return `yukikaki:${industryKey(spec.industry)}:${city}`;
}

const listSchema = z.object({
  datasets: z
    .array(
      z.object({
        dataset_id: z.string(),
        name: z.string().nullish(),
        status: z.string(),
        row_count: z.number().nullish(),
        description: z.string().nullish(),
      }),
    )
    .default([]),
});

/** Step 1: reuse an existing Adaption dataset for this industry (same city preferred). */
export async function findExisting(
  spec: Pick<StandInSpec, "industry" | "city">,
  signal?: AbortSignal,
): Promise<{ id: string; name: string } | null> {
  if (!configured.adaption()) throw new NotConfiguredError("adaption");
  const prefix = `yukikaki:${industryKey(spec.industry)}:`;
  const url = `${base()}/api/v1/datasets?q=${encodeURIComponent(prefix)}&status=succeeded&limit=50`;
  const { datasets } = listSchema.parse(await fetchJson(url, { headers: headers(), signal }));
  const wanted = datasetName(spec);
  const candidates = datasets.filter((d) => d.name?.startsWith(prefix) && d.status === "succeeded");
  const pick = candidates.find((d) => d.name === wanted) ?? candidates[0];
  return pick ? { id: pick.dataset_id, name: pick.name ?? wanted } : null;
}

export function buildInventPrompt(spec: StandInSpec, facts: GroundingFact[]): string {
  const factLines = facts
    .slice(0, 8)
    .map((f, i) => `[${i + 1}] ${f.title} (${f.url})\n${f.snippet.slice(0, 400)}`)
    .join("\n\n");
  return [
    `Japanese small business: ${spec.industry} in ${spec.city}, Japan.`,
    `Operational problem described by the owner: ${spec.problem}`,
    spec.currentProcess ? `How it is handled today: ${spec.currentProcess}` : "",
    "",
    "Generate realistic, FICTIONAL example rows a student team can use to build and test an AI automation for this business.",
    "Each row: prompt = an incoming customer message, supplier note, booking request or admin task this business receives (in natural Japanese);",
    "completion = the ideal, polite and accurate handling or reply (in Japanese).",
    "Do not use real people, real phone numbers or real addresses.",
    "Stay consistent with these real-world grounding facts (prices, seasonality, regulations, local context):",
    "",
    factLines,
  ]
    .filter((l) => l !== undefined)
    .join("\n")
    .slice(0, 9_500);
}

/** Step 2: generate a new dataset seeded from grounding facts. Returns the Adaption dataset id. */
export async function generateGrounded(
  spec: StandInSpec,
  facts: GroundingFact[],
  signal?: AbortSignal,
  rows = 30,
): Promise<{ id: string; name: string }> {
  if (facts.length === 0) throw new UngroundedError();
  if (!configured.adaption()) throw new NotConfiguredError("adaption");
  const name = datasetName(spec);
  const json = await fetchJson<{ id?: string | null }>(`${base()}/api/v1/datasets/invent`, {
    method: "POST",
    headers: headers(),
    signal,
    body: JSON.stringify({
      name,
      rows,
      training_type: "instruction_dataset",
      dataset_prompt: buildInventPrompt(spec, facts),
      idempotency_key: `yukikaki-${spec.briefId}`,
    }),
  });
  if (!json.id) throw new Error("Adaption invent returned no dataset id");
  return { id: json.id, name };
}

const statusSchema = z.object({ status: z.string(), error_data: z.object({ message: z.string() }).nullish() });

export async function getDatasetStatus(id: string, signal?: AbortSignal) {
  if (!configured.adaption()) throw new NotConfiguredError("adaption");
  return statusSchema.parse(await fetchJson(`${base()}/api/v1/datasets/${id}`, { headers: headers(), signal }));
}

/** Normalise Adaption download output (JSON array, {rows}, or JSONL) into rows. */
export function parseDownloadedRows(text: string): StandInRow[] {
  const trimmed = text.trim();
  let items: unknown[] = [];
  try {
    const parsed = JSON.parse(trimmed);
    items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : Array.isArray(parsed?.data) ? parsed.data : [];
  } catch {
    items = trimmed
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  return items
    .map((r) => {
      const o = r as Record<string, unknown>;
      const prompt = (o.enhanced_prompt ?? o.prompt ?? o.original_prompt ?? "") as string;
      const completion = (o.enhanced_completion ?? o.completion ?? o.original_completion ?? "") as string;
      return { prompt: String(prompt), completion: String(completion) };
    })
    .filter((r) => r.prompt || r.completion);
}

export async function downloadRows(id: string, signal?: AbortSignal): Promise<StandInRow[]> {
  if (!configured.adaption()) throw new NotConfiguredError("adaption");
  const res = await fetch(`${base()}/api/v1/datasets/${id}/download?fileFormat=json`, { headers: headers(), signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading dataset ${id}`);
  return parseDownloadedRows(await res.text());
}

/** Poll until ready (returns rows), failed (throws), or maxWaitMs elapsed (returns null = still pending). */
export async function waitForRows(
  id: string,
  opts: { maxWaitMs?: number; intervalMs?: number; signal?: AbortSignal } = {},
): Promise<StandInRow[] | null> {
  const deadline = Date.now() + (opts.maxWaitMs ?? 30_000);
  const interval = opts.intervalMs ?? 3_000;
  for (;;) {
    const s = await getDatasetStatus(id, opts.signal);
    if (s.status === "succeeded" || s.status === "ready") return downloadRows(id, opts.signal);
    if (s.status === "failed") throw new Error(`Adaption dataset ${id} failed: ${s.error_data?.message ?? "unknown"}`);
    if (Date.now() + interval > deadline) return null;
    await new Promise((r) => setTimeout(r, interval));
  }
}
