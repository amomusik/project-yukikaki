import { z } from "zod";
import { configured, env } from "@/lib/env";
import { fetchJson, NotConfiguredError } from "./_guard";

/** Linkup search API — https://docs.linkup.so */
const LINKUP_URL = "https://api.linkup.so/v1/search";

const resultSchema = z.object({
  type: z.string().optional(),
  name: z.string().default(""),
  url: z.string(),
  content: z.string().default(""),
});
const responseSchema = z.object({ results: z.array(resultSchema).default([]) });

export type LinkupResult = { title: string; url: string; snippet: string };

export function parseLinkupResponse(json: unknown): LinkupResult[] {
  const parsed = responseSchema.parse(json);
  return parsed.results
    .filter((r) => r.url && (r.type === undefined || r.type === "text"))
    .map((r) => ({ title: r.name || r.url, url: r.url, snippet: r.content.slice(0, 600) }));
}

export type LinkupOptions = { includeDomains?: string[]; maxResults?: number };

export async function linkupSearch(query: string, signal?: AbortSignal, opts: LinkupOptions = {}): Promise<LinkupResult[]> {
  if (!configured.linkup()) throw new NotConfiguredError("linkup");
  const json = await fetchJson(LINKUP_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.LINKUP_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: query,
      depth: "standard",
      outputType: "searchResults",
      maxResults: opts.maxResults ?? 10,
      ...(opts.includeDomains?.length ? { includeDomains: opts.includeDomains } : {}),
    }),
    signal,
  });
  return parseLinkupResponse(json);
}
