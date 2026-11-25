import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { DataSource } from "@/lib/db/schema";
import type { StandInRow } from "@/lib/integrations/adaption";

/**
 * Synthetic dataset payloads live in the database (data_sources.payload, jsonb) so the app
 * works on read-only serverless filesystems (Vercel). Legacy rows that only have
 * payload_path (data/synthetic/… or seed/…) are still readable as a fallback.
 */
const ROOT = process.cwd();

export type SyntheticPayload = {
  name: string;
  generatedBy: "adaption" | "prebaked" | "seed";
  externalId?: string | null;
  groundedOn: { title: string; url: string }[];
  rows: StandInRow[];
};

/** Store a synthetic payload on its data_sources row. Extra column updates (e.g. pending) may be passed. */
export async function saveSynthetic(
  id: string,
  payload: SyntheticPayload,
  extra: Partial<Pick<DataSource, "pending" | "snippet">> = {},
): Promise<void> {
  await getDb()
    .update(schema.dataSources)
    .set({ ...extra, payload, payloadPath: null })
    .where(eq(schema.dataSources.id, id));
}

/** Read the payload of a data_sources row (DB first, legacy on-disk file as fallback). */
export async function readSynthetic(
  ds: Pick<DataSource, "payload" | "payloadPath">,
): Promise<SyntheticPayload | null> {
  if (ds.payload) return ds.payload;
  if (!ds.payloadPath) return null;
  const abs = path.resolve(ROOT, ds.payloadPath);
  if (!abs.startsWith(ROOT + path.sep)) return null; // never read outside the project
  try {
    return JSON.parse(await fs.readFile(abs, "utf8")) as SyntheticPayload;
  } catch {
    return null;
  }
}

/** True when the row has (or may have) a readable payload. */
export const hasSynthetic = (ds: Pick<DataSource, "payload" | "payloadPath">) => Boolean(ds.payload || ds.payloadPath);

export function toCsv(rows: StandInRow[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ["prompt,completion", ...rows.map((r) => `${esc(r.prompt)},${esc(r.completion)}`)].join("\n");
}
