import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { configured, env } from "@/lib/env";
import { fetchJson, NotConfiguredError } from "./_guard";

/** ElevenLabs Agents Platform — conversations API + post-call webhook. */
const API = "https://api.elevenlabs.io/v1/convai";

/* ── Webhook signature: header `ElevenLabs-Signature: t=<unix>,v0=<hex hmac>` ── */
export function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 30 * 60,
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v0 = parts.v0;
  if (!t || !v0) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v0);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ── Conversation shape (GET /conversations/{id} and webhook `data`) ── */
export const conversationSchema = z.object({
  agent_id: z.string(),
  conversation_id: z.string(),
  status: z.string(),
  transcript: z
    .array(z.object({ role: z.string(), message: z.string().nullish() }))
    .default([]),
  analysis: z
    .object({
      data_collection_results: z
        .record(z.string(), z.object({ value: z.unknown().nullish() }).passthrough())
        .default({}),
      transcript_summary: z.string().nullish(),
    })
    .partial()
    .nullish(),
  conversation_initiation_client_data: z
    .object({ dynamic_variables: z.record(z.string(), z.unknown()).nullish() })
    .partial()
    .nullish(),
});

export type ParsedConversation = {
  agentId: string;
  conversationId: string;
  status: string;
  transcriptText: string;
  fields: Record<string, unknown>;
  dynamicVariables: Record<string, unknown>;
  summary: string | null;
};

export function parseConversation(json: unknown): ParsedConversation {
  const c = conversationSchema.parse(json);
  const fields = Object.fromEntries(
    Object.entries(c.analysis?.data_collection_results ?? {}).map(([k, v]) => [k, v.value ?? null]),
  );
  return {
    agentId: c.agent_id,
    conversationId: c.conversation_id,
    status: c.status,
    transcriptText: c.transcript
      .filter((t) => t.message)
      .map((t) => `${t.role === "agent" ? "Agent" : "Owner"}: ${t.message}`)
      .join("\n"),
    fields,
    dynamicVariables: c.conversation_initiation_client_data?.dynamic_variables ?? {},
    summary: c.analysis?.transcript_summary ?? null,
  };
}

export const webhookSchema = z.object({
  type: z.string(),
  event_timestamp: z.number().optional(),
  data: z.unknown(),
});

/* ── Field mapping → domain drafts ── */
const str = z.preprocess((v) => (v == null ? "" : String(v)), z.string());
const list = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v.map(String)
      : v == null || v === ""
        ? []
        : String(v)
            .split(/[,、，;・\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
  z.array(z.string()),
);
/** Round hours to one decimal (e.g. 2.5 h/week). */
export const roundHours = (n: number) => Math.round(n * 10) / 10;
const hoursOrNull = z.preprocess((v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? roundHours(n) : null;
}, z.number().nonnegative().nullable());
const bool = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase();
  return ["true", "yes", "はい", "1", "y"].includes(s);
}, z.boolean());

export const briefDraftSchema = z.object({
  business_name: str.pipe(z.string().min(1)),
  industry: str.pipe(z.string().min(1)),
  city: str.pipe(z.string().min(1)),
  ward: str,
  problem: str.pipe(z.string().min(1)),
  current_process: str,
  desired_outcome: str,
  tools_used: list,
  hours_lost_per_week: hoursOrNull,
  data_sensitivity: z.preprocess(
    (v) => (["public", "private", "synthetic_ok"].includes(String(v)) ? String(v) : "synthetic_ok"),
    z.enum(["public", "private", "synthetic_ok"]),
  ),
  preferred_language: z.preprocess((v) => (String(v ?? "").toLowerCase().startsWith("en") ? "en" : "ja"), z.enum(["ja", "en"])),
});
export type BriefDraft = z.infer<typeof briefDraftSchema>;

export const impactDraftSchema = z.object({
  hours_saved_per_week: hoursOrNull,
  satisfaction: z.preprocess((v) => {
    const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.min(5, Math.max(1, Math.round(n))) : null;
  }, z.number().int().nullable()),
  still_in_use: bool,
  issues: str,
  would_recommend: bool,
  quote: str,
});
export type ImpactDraft = z.infer<typeof impactDraftSchema>;

export type AgentKind = "interview" | "impact" | "unknown";
export function agentKind(agentId: string): AgentKind {
  if (env.ELEVENLABS_INTERVIEW_AGENT_ID && agentId === env.ELEVENLABS_INTERVIEW_AGENT_ID) return "interview";
  if (env.ELEVENLABS_IMPACT_AGENT_ID && agentId === env.ELEVENLABS_IMPACT_AGENT_ID) return "impact";
  return "unknown";
}

/* ── API calls ── */
export async function getConversation(id: string, signal?: AbortSignal): Promise<ParsedConversation> {
  if (!configured.elevenlabs()) throw new NotConfiguredError("elevenlabs");
  const json = await fetchJson(`${API}/conversations/${encodeURIComponent(id)}`, {
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY! },
    signal,
  });
  return parseConversation(json);
}

/** Poll until ElevenLabs finished post-call analysis (status "done"). */
export async function waitForConversation(
  id: string,
  opts: { maxWaitMs?: number; intervalMs?: number; signal?: AbortSignal } = {},
): Promise<ParsedConversation> {
  const deadline = Date.now() + (opts.maxWaitMs ?? 90_000);
  const interval = opts.intervalMs ?? 3_000;
  for (;;) {
    const c = await getConversation(id, opts.signal);
    if (c.status === "done") return c;
    if (c.status === "failed") throw new Error(`Conversation ${id} failed`);
    if (Date.now() + interval > deadline) throw new Error(`Conversation ${id} not analysed yet (status ${c.status})`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

/** Signed URL so private agents can be used from the browser without exposing the API key. */
export async function getSignedUrl(agentId: string): Promise<string> {
  if (!configured.elevenlabs()) throw new NotConfiguredError("elevenlabs");
  const json = await fetchJson<{ signed_url: string }>(
    `${API}/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": env.ELEVENLABS_API_KEY! } },
  );
  return json.signed_url;
}
