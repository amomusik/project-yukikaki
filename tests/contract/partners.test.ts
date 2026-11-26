import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { load as yamlLoad } from "js-yaml";
import { env } from "@/lib/env";
import { briefReviewSchema, reviewBrief, reviewTeam, runWorkflow, teamReviewSchema } from "@/lib/integrations/dify";
import {
  briefDraftSchema,
  conversationSchema,
  getConversation,
  getSignedUrl,
  impactDraftSchema,
  parseConversation,
  verifySignature,
  waitForConversation,
  webhookSchema,
} from "@/lib/integrations/elevenlabs";
import { linkupSearch, parseLinkupResponse } from "@/lib/integrations/linkup";
import { findExisting, getDatasetStatus, parseDownloadedRows, waitForRows, downloadRows, generateGrounded, UngroundedError } from "@/lib/integrations/adaption";
import { sendImpactCheckEmail, sendWaitlistEmail } from "@/lib/integrations/email";
import { fetchSubsidies, fetchSubsidyDetail, parseSubsidiesResponse, parseSubsidyDetailResponse } from "@/lib/grants/jgrants";
import difyFixture from "../fixtures/dify-brief-review.json";
import interviewFixture from "../fixtures/elevenlabs-interview.json";
import impactFixture from "../fixtures/elevenlabs-impact.json";
import linkupFixture from "../fixtures/linkup-search.json";
import adaptionList from "../fixtures/adaption-list.json";
import adaptionStatus from "../fixtures/adaption-status.json";
import adaptionDownload from "../fixtures/adaption-download.json";
import jgrantsSearch from "../fixtures/jgrants-search.json";
import jgrantsDetail from "../fixtures/jgrants-detail.json";
import resendSend from "../fixtures/resend-send.json";

/**
 * Contract suite: every partner adapter is driven against a recorded (or documented) payload through
 * a stubbed fetch, so a breaking API change shows up as a failing schema here, not in production.
 */
type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
const saved: Record<string, string | undefined> = {};
const KEYS = ["DIFY_BRIEF_REVIEW_KEY", "DIFY_TEAM_REVIEW_KEY", "ELEVENLABS_API_KEY", "LINKUP_API_KEY", "ADAPTION_API_KEY", "RESEND_API_KEY"] as const;

function stubFetch(responder: (url: string, init: RequestInit) => { status?: number; body: unknown; text?: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      const r = responder(url, init);
      const body = r.text ? String(r.body) : JSON.stringify(r.body);
      return new Response(body, { status: r.status ?? 200, headers: { "content-type": r.text ? "text/plain" : "application/json" } });
    }),
  );
}
const bodyOf = (c: Call) => JSON.parse(String(c.init.body));
const headerOf = (c: Call, h: string) => new Headers(c.init.headers).get(h);

beforeEach(() => {
  calls = [];
  for (const k of KEYS) {
    saved[k] = env[k];
    (env as Record<string, unknown>)[k] = `test-${k.toLowerCase()}`;
  }
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) (env as Record<string, unknown>)[k] = saved[k];
});

/* ── Dify ─────────────────────────────────────────────────────────── */
type DslNode = { data: { type: string; variables?: { variable: string }[]; outputs?: { variable: string }[] } };
function startVariables(file: string): string[] {
  const dsl = yamlLoad(readFileSync(file, "utf8")) as { workflow: { graph: { nodes: DslNode[] } } };
  const start = dsl.workflow.graph.nodes.find((n) => n.data.type === "start")!;
  return start.data.variables!.map((v) => v.variable).sort();
}
function endOutputs(file: string): string[] {
  const dsl = yamlLoad(readFileSync(file, "utf8")) as { workflow: { graph: { nodes: DslNode[] } } };
  return dsl.workflow.graph.nodes.find((n) => n.data.type === "end")!.data.outputs!.map((o) => o.variable);
}

describe("Dify contract", () => {
  it("the app sends exactly the inputs the brief-review DSL declares, and parses the recorded output", async () => {
    stubFetch(() => ({ body: difyFixture }));
    const r = await reviewBrief({
      content: { ja: { title: "t", problem: "p", current_process: "c", desired_outcome: "d" }, en: { title: "t", problem: "p", current_process: "c", desired_outcome: "d" } },
      transcript: "x".repeat(25_000),
      sources: "s",
      groundingLevel: "exact",
      meta: "{}",
    });
    expect(briefReviewSchema.safeParse(r).success).toBe(true);
    const sent = bodyOf(calls[0]);
    expect(Object.keys(sent.inputs).sort()).toEqual(startVariables("dify/brief-review.yml"));
    expect(sent.response_mode).toBe("blocking");
    expect(sent.inputs.transcript).toHaveLength(20_000); // truncated before sending
    expect(calls[0].url).toMatch(/\/v1\/workflows\/run$/);
    expect(headerOf(calls[0], "authorization")).toBe("Bearer test-dify_brief_review_key");
    expect(endOutputs("dify/brief-review.yml")).toEqual(["result"]);
  });

  it("team review sends the team DSL's inputs", async () => {
    stubFetch(() => ({ body: { data: { status: "succeeded", outputs: { result: '{"recommendation":"approve","score":80,"issues":[],"lead_named":true}' } } } }));
    const r = await reviewTeam({ brief: "{}", team: "{}", members: "[]" });
    expect(teamReviewSchema.parse(r).lead_named).toBe(true);
    expect(Object.keys(bodyOf(calls[0]).inputs).sort()).toEqual(startVariables("dify/team-review.yml"));
    expect(endOutputs("dify/team-review.yml")).toEqual(["result"]);
  });

  it("surfaces failed runs and HTTP errors", async () => {
    stubFetch(() => ({ body: { data: { status: "failed", error: "LLM quota", outputs: null } } }));
    await expect(runWorkflow("k", {})).rejects.toThrow(/failed: LLM quota/);
    stubFetch(() => ({ status: 401, body: { message: "bad key" } }));
    await expect(runWorkflow("k", {})).rejects.toThrow(/HTTP 401/);
    stubFetch(() => ({ body: { unexpected: true } }));
    await expect(runWorkflow("k", {})).rejects.toThrow();
  });
});

/* ── ElevenLabs ───────────────────────────────────────────────────── */
describe("ElevenLabs contract", () => {
  it("recorded conversations satisfy conversationSchema and map to drafts", () => {
    expect(conversationSchema.safeParse(interviewFixture).success).toBe(true);
    expect(conversationSchema.safeParse(impactFixture).success).toBe(true);
    const interview = briefDraftSchema.safeParse(parseConversation(interviewFixture).fields);
    expect(interview.success).toBe(true);
    const impact = impactDraftSchema.safeParse(parseConversation(impactFixture).fields);
    expect(impact.success).toBe(true);
  });

  it("getConversation / waitForConversation / getSignedUrl call the documented endpoints", async () => {
    let n = 0;
    stubFetch((url) => {
      if (url.includes("get-signed-url")) return { body: { signed_url: "wss://signed" } };
      n++;
      return { body: { ...interviewFixture, status: n === 1 ? "processing" : "done" } };
    });
    const c = await waitForConversation("conv 1", { intervalMs: 1, maxWaitMs: 1_000 });
    expect(c.status).toBe("done");
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/convai/conversations/conv%201");
    expect(headerOf(calls[0], "xi-api-key")).toBe("test-elevenlabs_api_key");
    expect((await getConversation("x")).conversationId).toBe(interviewFixture.conversation_id);
    expect(await getSignedUrl("agent_1")).toBe("wss://signed");
    expect(calls.at(-1)!.url).toContain("agent_id=agent_1");
  });

  it("failed or never-finishing analyses throw", async () => {
    stubFetch(() => ({ body: { ...interviewFixture, status: "failed" } }));
    await expect(waitForConversation("c", { intervalMs: 1 })).rejects.toThrow(/failed/);
    stubFetch(() => ({ body: { ...interviewFixture, status: "processing" } }));
    await expect(waitForConversation("c", { intervalMs: 5, maxWaitMs: 1 })).rejects.toThrow(/not analysed/);
  });

  it("webhook envelope + HMAC signature (t=…,v0=…) round-trip", async () => {
    const { createHmac } = await import("node:crypto");
    const raw = JSON.stringify({ type: "post_call_transcription", event_timestamp: 1, data: interviewFixture });
    expect(webhookSchema.safeParse(JSON.parse(raw)).success).toBe(true);
    const t = 1_764_000_000;
    const sig = createHmac("sha256", "whsec").update(`${t}.${raw}`).digest("hex");
    expect(verifySignature(raw, `t=${t},v0=${sig}`, "whsec", t)).toBe(true);
    expect(verifySignature(raw, `t=${t},v0=${sig}`, "whsec", t + 3600)).toBe(false); // replay window
    expect(verifySignature(raw + " ", `t=${t},v0=${sig}`, "whsec", t)).toBe(false);
  });
});

/* ── Linkup ───────────────────────────────────────────────────────── */
describe("Linkup contract", () => {
  it("sends searchResults queries with includeDomains and parses the recorded response", async () => {
    stubFetch(() => ({ body: linkupFixture }));
    const r = await linkupSearch("札幌 飲食店", undefined, { includeDomains: ["city.sapporo.jp"], maxResults: 3 });
    expect(r).toEqual(parseLinkupResponse(linkupFixture));
    const sent = bodyOf(calls[0]);
    expect(sent).toMatchObject({ q: "札幌 飲食店", outputType: "searchResults", maxResults: 3, includeDomains: ["city.sapporo.jp"] });
    expect(headerOf(calls[0], "authorization")).toBe("Bearer test-linkup_api_key");
  });
  it("rejects a response without results array items of the right shape", () => {
    expect(() => parseLinkupResponse({ results: [{ name: "no url" }] })).toThrow();
    expect(parseLinkupResponse({})).toEqual([]);
  });
});

/* ── Adaption Labs ────────────────────────────────────────────────── */
describe("Adaption contract", () => {
  it("findExisting parses the recorded dataset list and prefers the same city", async () => {
    stubFetch(() => ({ body: adaptionList }));
    const hit = await findExisting({ industry: "簡易宿所", city: "Otaru" });
    expect(hit).toEqual({ id: adaptionList.datasets[0].dataset_id, name: adaptionList.datasets[0].name });
    expect(calls[0].url).toContain("/api/v1/datasets?q=");
    expect(calls[0].url).toContain("status=succeeded");
  });

  it("status + download: recorded status parses, rows normalise (enhanced_* preferred, blanks dropped)", async () => {
    stubFetch((url) => (url.includes("/download") ? { body: adaptionDownload } : { body: adaptionStatus }));
    expect((await getDatasetStatus(adaptionStatus.dataset_id)).status).toBe("succeeded");
    const rows = await waitForRows(adaptionStatus.dataset_id, { intervalMs: 1 });
    expect(rows).toHaveLength(2);
    expect(rows![0].prompt).toBe(adaptionDownload[0].enhanced_prompt);
    expect(parseDownloadedRows(JSON.stringify({ rows: adaptionDownload }))).toHaveLength(2);
    expect(parseDownloadedRows(adaptionDownload.map((r) => JSON.stringify(r)).join("\n"))).toHaveLength(2);
  });

  it("failed datasets throw, pending ones return null, download errors surface", async () => {
    stubFetch(() => ({ body: { status: "failed", error_data: { message: "quota" } } }));
    await expect(waitForRows("d", { intervalMs: 1 })).rejects.toThrow(/quota/);
    stubFetch(() => ({ body: { status: "running" } }));
    expect(await waitForRows("d", { intervalMs: 10, maxWaitMs: 1 })).toBeNull();
    stubFetch(() => ({ status: 500, body: "boom", text: true }));
    await expect(downloadRows("d")).rejects.toThrow(/HTTP 500/);
  });

  it("generateGrounded refuses to invent without grounding facts and sends an idempotency key", async () => {
    await expect(generateGrounded({ briefId: "b1", industry: "ramen", city: "Sapporo", problem: "p" }, [])).rejects.toBeInstanceOf(UngroundedError);
    stubFetch(() => ({ body: { id: "ds_1" } }));
    const r = await generateGrounded({ briefId: "b1", industry: "ramen", city: "Sapporo", problem: "p" }, [{ title: "t", url: "https://www.city.sapporo.jp/x", snippet: "s" }]);
    expect(r.id).toBe("ds_1");
    expect(bodyOf(calls[0])).toMatchObject({ idempotency_key: "yukikaki-b1", training_type: "instruction_dataset" });
    stubFetch(() => ({ body: { id: null } }));
    await expect(generateGrounded({ briefId: "b1", industry: "ramen", city: "Sapporo", problem: "p" }, [{ title: "t", url: "u", snippet: "s" }])).rejects.toThrow(/no dataset id/);
  });
});

/* ── jGrants ──────────────────────────────────────────────────────── */
describe("jGrants contract", () => {
  it("recorded search + detail payloads parse through the transport", async () => {
    const fetchImpl = (async (url: string) =>
      new Response(JSON.stringify(String(url).includes("/subsidies/id/") ? jgrantsDetail : jgrantsSearch), { status: 200 })) as unknown as typeof fetch;
    const list = await fetchSubsidies({ keyword: "補助金" }, { fetchImpl, minIntervalMs: 0 });
    expect(list.length).toBe(parseSubsidiesResponse(jgrantsSearch).length);
    expect(list.length).toBeGreaterThan(0);
    for (const g of list) expect(g.id).toMatch(/^\w+$/);
    const d = await fetchSubsidyDetail(list[0].id, { fetchImpl, minIntervalMs: 0 });
    expect(d).toEqual(parseSubsidyDetailResponse(jgrantsDetail));
  });
});

/* ── Resend ───────────────────────────────────────────────────────── */
describe("Resend contract", () => {
  it("impact-check and waitlist mails POST /emails with from/to/subject/html/text and return the id", async () => {
    stubFetch(() => ({ body: resendSend }));
    const r = await sendImpactCheckEmail({ to: "owner@example.com", link: "https://x/feedback/abc", businessName: "麺屋ゆき", teamName: "Snow", leadName: "Haruto", locale: "ja" });
    expect(r.id).toBe(resendSend.id);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const sent = bodyOf(calls[0]);
    expect(sent).toMatchObject({ from: env.EMAIL_FROM });
    expect([sent.to].flat()).toEqual(["owner@example.com"]);
    expect(sent.subject).toBeTruthy();
    expect(sent.html).toContain("https://x/feedback/abc");
    expect(sent.text).toContain("https://x/feedback/abc");
    const w = await sendWaitlistEmail({ to: "a@example.com", locale: "en", features: ["team"] });
    expect(w.id).toBe(resendSend.id);
  });

  it("Resend errors become thrown errors (callers fall back to the copy-link UI)", async () => {
    stubFetch(() => ({ status: 422, body: { name: "validation_error", message: "domain not verified", statusCode: 422 } }));
    await expect(sendImpactCheckEmail({ to: "o@example.com", link: "l", businessName: "b", teamName: "t", leadName: "l", locale: "en" })).rejects.toThrow(/Resend/);
  });
});
