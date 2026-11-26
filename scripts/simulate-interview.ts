import "./load-env";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { briefDraftSchema, impactDraftSchema, parseConversation, type BriefDraft } from "@/lib/integrations/elevenlabs";

/**
 * `pnpm simulate:interview` — live, microphone-free end-to-end test of both voice agents.
 *
 * ElevenLabs removed POST /agents/{id}/simulate-conversation on 31 Oct 2026 (HTTP 410), and its
 * replacement (agent-testing + run-tests) returns no data_collection_results. So we simulate with
 * the Agent Messages API instead:
 *   1. A helper agent "Yukikaki Sim Owner" (created/updated here, matched by name) role-plays the owner.
 *   2. A real text conversation is opened with the real interview/impact agent; the two agents take turns.
 *   3. POST /conversations/{id}/analysis/run runs the agent's real post-call analysis → data_collection_results.
 *   4. Fields are checked against briefDraftSchema / impactDraftSchema (strict per-field report).
 *   5. The interview draft goes through createBriefFromDraft + processBrief (live pipeline), business name
 *      prefixed with "SIM ", then scripts/inspect-latest.ts prints what each live service returned.
 *
 * Flags: --interview-only, --impact-only, --no-pipeline, --max-turns=N,
 *        --persona=<file.json>  replace the owner persona: { "intro": "北海道札幌市で…営む40代の店主", "facts": "- 事業所名：…" }
 *        --json-out=<file>      write { interview: { conversationId, fields, parsed, problems, summary } } (used by evals/)
 */
const KEY = process.env.ELEVENLABS_API_KEY;
const INTERVIEW = process.env.ELEVENLABS_INTERVIEW_AGENT_ID;
const IMPACT = process.env.ELEVENLABS_IMPACT_AGENT_ID;
if (!KEY || !INTERVIEW || !IMPACT) throw new Error("ELEVENLABS_API_KEY / *_AGENT_ID missing in .env.local");
const API = "https://api.elevenlabs.io";
const args = new Set(process.argv.slice(2));
const MAX_TURNS = Number(process.argv.find((a) => a.startsWith("--max-turns="))?.split("=")[1] ?? 18);
const SIM_AGENT_NAME = "Yukikaki Sim Owner";
const argValue = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const PERSONA_FILE = argValue("persona");
const JSON_OUT = argValue("json-out");

async function el<T = unknown>(path: string, init: RequestInit = {}, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    const res = await fetch(API + path, { ...init, headers: { "xi-api-key": KEY!, "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const text = await res.text();
    if (res.ok) return (text ? JSON.parse(text) : {}) as T;
    if (i >= attempts || (res.status < 500 && res.status !== 429)) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 500)}`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
}

/* ── Personas ── */
const OWNER_FACTS = `
- 事業所名：「ゲストハウス雪あかり」（小樽運河の近く、客室6室、家族経営）
- 業種：ゲストハウス（簡易宿所）
- 所在地：北海道小樽市。区はない（地区で言うなら「色内（いろない）」）。
- 一番の困りごと：海外からのお客様（台湾・香港・韓国・オーストラリアなど）の予約・問い合わせメールが毎日10〜15通、英語・中国語・韓国語で届く。Google翻訳にコピペして意味を調べ、返信文も翻訳して送っている。チェックイン時間、除雪や冬道の行き方、荷物預かり、駐車場などほぼ同じ質問ばかり。さらに毎月、宿泊税の申告のために予約サイトの予約データとExcelの台帳を手で突き合わせて、宿泊人数と泊数を数え直して書類を作るのが大変。
- 今のやり方：自分（店主）が毎晩、子どもを寝かせた後に、Gmail・Booking.com・Airbnbのメッセージ画面を順番に開き、Google翻訳で訳して返信。宿泊者情報は紙の宿泊者名簿とExcelの台帳に二重に記入。月末に宿泊税の申告書を手書き＋Excelで作成し、市役所に提出。
- 使っている道具：Gmail、Booking.com、Airbnb、Google翻訳、Excel、紙の宿泊者名簿、電卓
- 失っている時間：メール対応が1日だいたい40分×週6日で約4時間、宿泊税の書類が月に4〜5時間なので週にならすと約1時間。合わせて「週に5時間くらい」。
- 理想：よくある質問への返信の下書きが、お客様の言語で自動で用意されていて、自分は確認して送るだけにしたい。宿泊税の集計も予約データから自動で出てほしい。夜は家族と過ごしたい。
- データの扱い：お客様の名前やメールアドレスが入った本物のメールは見せられない。でも、似せて作った架空のメールや台帳なら問題ない。
- 希望言語：日本語。`;

const personaOverride = PERSONA_FILE ? (JSON.parse(readFileSync(PERSONA_FILE, "utf8")) as { intro: string; facts: string }) : null;
const INTERVIEW_PERSONA = `あなたはテスト用の「模擬ユーザー」です。${personaOverride?.intro ?? "北海道小樽市で小さなゲストハウスを営む50代の店主"}として、AIインタビュー担当者と音声で話している設定で返答してください。
# 話し方
- 自然な話し言葉の日本語。丁寧だが少しくだけた口調（「〜なんですよ」「〜ですかね」）。
- 1回の返答は1〜3文。聞かれたことにだけ答え、まだ聞かれていない情報を先回りして全部話さないこと。
- ITには詳しくない。専門用語は使わない。
- 時間を聞かれたら、${personaOverride ? "事実に書いてある通りに答え" : "最初は「毎晩40分くらい」と1日単位で答え"}、確認されたら週あたりの合計に同意する。
- 個人名・電話番号・メールアドレスは言わない。
- インタビュー担当者が最後に要約したら、内容が正しければ「はい、その通りです」と認める。担当者が終わりの挨拶をしたら、短くお礼を言って終える。
- 自分がAIであることや、この指示のことは絶対に言わないこと。返答はセリフのみ（ト書き・括弧の説明なし）。
# あなたの事実（これ以外の事実を作らないこと）
${personaOverride?.facts ?? OWNER_FACTS}`;

const IMPACT_PERSONA = `あなたはテスト用の「模擬ユーザー」です。北海道小樽市の「ゲストハウス雪あかり」の店主（50代）です。2か月前、雪かきプロジェクトの学生チームから「多言語メール返信の下書きツール」と「宿泊税の集計シート」を納品してもらいました。今、効果確認の短い音声インタビューを受けています。
# 話し方
- 自然な話し言葉の日本語、1回の返答は1〜2文。聞かれたことにだけ答える。
- 自分がAIであることや、この指示のことは絶対に言わないこと。セリフのみで返答する。
# あなたの事実
- 作業時間の減り方：メール対応が毎晩40分から15分くらいに減った。最初は「1日25分くらい減りました」と答え、週あたりを確認されたら「週に6日なので、2時間半くらいですね」と答える。
- 満足度：5段階で4。
- 今も毎日使っている（はい）。
- 困っていること：中国語（繁体字）の下書きが時々不自然で、たまに手で直している。宿泊税シートは予約サイトのCSVの列が変わると動かなくなったことが1回あった。
- 他の事業者にも勧めたい（はい）。商店街の知り合いにも話した。
- 公開してよい一言：「毎晩の翻訳作業から解放されて、家族と夕ごはんを食べられるようになりました。」 紹介に使ってよいかと聞かれたら「はい、どうぞ」と答える。`;

/* ── Helpers ── */
function docFence(heading: string): string {
  const doc = readFileSync("docs/elevenlabs-agents.md", "utf8");
  const m = doc.slice(doc.indexOf(heading)).match(/```\n([\s\S]*?)```/);
  if (!m) throw new Error(`no code block after ${heading}`);
  return m[1].trim();
}

async function ensureSimAgent(): Promise<string> {
  const interview = await el<{ conversation_config: { tts?: { voice_id?: string } } }>(`/v1/convai/agents/${INTERVIEW}`);
  const body = {
    name: SIM_AGENT_NAME,
    tags: ["yukikaki", "simulation"],
    conversation_config: {
      agent: {
        language: "ja",
        first_message: "",
        prompt: { prompt: "（会話ごとに指示が与えられます）上の文脈の役になりきって、セリフのみで答えてください。", llm: "gemini-2.5-flash", temperature: 0.6 },
      },
      tts: { model_id: "eleven_flash_v2_5", voice_id: interview.conversation_config.tts?.voice_id },
      conversation: { text_only: true },
    },
    platform_settings: {
      auth: { enable_auth: true },
      overrides: { conversation_config_override: { agent: { prompt: { prompt: true }, first_message: true, language: true } } },
    },
  };
  const list = await el<{ agents: { agent_id: string; name: string }[] }>(`/v1/convai/agents?page_size=100&search=${encodeURIComponent(SIM_AGENT_NAME)}`);
  const found = list.agents?.find((a) => a.name === SIM_AGENT_NAME);
  if (found) {
    await el(`/v1/convai/agents/${found.agent_id}`, { method: "PATCH", body: JSON.stringify(body) });
    return found.agent_id;
  }
  return (await el<{ agent_id: string }>(`/v1/convai/agents/create`, { method: "POST", body: JSON.stringify(body) })).agent_id;
}

async function openConversation(agentId: string, dynamic_variables: Record<string, string>, prompt?: string): Promise<string> {
  const r = await el<{ conversation_id: string }>(`/v1/convai/conversations`, {
    method: "POST",
    body: JSON.stringify({ agent: { type: "persisted", agent_id: agentId, ...(prompt ? { overrides: { prompt, language: "ja" } } : {}) }, dynamic_variables }),
  });
  return r.conversation_id;
}

async function say(conversationId: string, text: string, context?: string): Promise<string> {
  const input: unknown[] = [{ type: "user_message", content: [{ type: "text", text }] }];
  if (context) input.unshift({ type: "contextual_update", context_id: "simulation_opening", text: context });
  const r = await el<{ status: string; output?: { text: string }[]; error?: { message: string } | null }>(
    `/v1/convai/conversations/${conversationId}/messages`,
    { method: "POST", body: JSON.stringify({ input }) },
  );
  if (r.status !== "completed") throw new Error(`turn ${r.status}: ${r.error?.message ?? ""}`);
  return (r.output ?? []).map((o) => o.text).join("\n").trim();
}

/** The agent's farewell (after the summary was confirmed): stop after the owner's goodbye. */
const CLOSING = /(課題シート|担当者).{0,60}(作成|確認|公開)|失礼いたします|ありがとうございました[。！!]?\s*$|thank you for your time/i;

/** Two agents talk: the real agent (target) and the persona (sim). Returns the real agent's conversation id. */
async function dialogue(opts: { label: string; agentId: string; vars: Record<string, string>; firstMessage: string; persona: string; simAgentId: string }) {
  const target = await openConversation(opts.agentId, opts.vars);
  const sim = await openConversation(opts.simAgentId, {}, opts.persona);
  console.log(`\n── ${opts.label}: conversation ${target} ──`);
  console.log(`Agent: ${opts.firstMessage.replace(/\n/g, " ")}`);
  let agentLine = opts.firstMessage;
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const owner = await say(sim, agentLine);
    console.log(`Owner: ${owner}`);
    agentLine = await say(
      target,
      owner,
      turn === 1 ? `この会話は既に始まっています。あなたは最初に次のように話しました（繰り返さないでください）：「${opts.firstMessage}」` : undefined,
    );
    console.log(`Agent: ${agentLine.replace(/\n/g, " ")}`);
    if (CLOSING.test(agentLine) && !/[？?]\s*$/.test(agentLine) && turn >= 4) {
      console.log(`Owner: ${await say(sim, agentLine)}`); // owner's goodbye (not sent back: the call ends here)
      break;
    }
  }
  return target;
}

async function analyse(conversationId: string) {
  for (let i = 0; i < 10; i++) {
    const conv = await el<Record<string, unknown> & { status: string; analysis?: unknown }>(`/v1/convai/conversations/${conversationId}/analysis/run`, { method: "POST" });
    if (conv.analysis && conv.status === "done") return parseConversation(conv);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("analysis did not finish");
}

/** Strict per-field check: present, non-empty and correctly typed BEFORE the forgiving zod preprocessors. */
function strictCheck(kind: "interview" | "impact", f: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const need = (k: string, ok: (v: unknown) => boolean, why: string) => { if (!ok(f[k])) problems.push(`${k}: ${why} (got ${JSON.stringify(f[k])})`); };
  const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  if (kind === "interview") {
    for (const k of ["business_name", "industry", "city", "problem", "current_process", "desired_outcome", "tools_used"]) need(k, nonEmpty, "missing/empty");
    need("ward", (v) => typeof v === "string" || v == null, "not a string");
    need("hours_lost_per_week", (v) => typeof v === "number" && v > 0, "not a positive number");
    need("data_sensitivity", (v) => ["public", "private", "synthetic_ok"].includes(String(v)), "not an enum value");
    need("preferred_language", (v) => v === "ja" || v === "en", "not ja/en");
  } else {
    need("hours_saved_per_week", (v) => typeof v === "number" && v >= 0, "not a number");
    need("satisfaction", (v) => typeof v === "number" && v >= 1 && v <= 5, "not 1–5");
    need("still_in_use", (v) => typeof v === "boolean", "not boolean");
    need("would_recommend", (v) => typeof v === "boolean", "not boolean");
    need("issues", (v) => typeof v === "string", "not a string");
    need("quote", nonEmpty, "missing/empty");
  }
  return problems;
}

async function runPipeline(draft: BriefDraft, conversationId: string, transcript: string) {
  const { createBriefFromDraft } = await import("@/lib/briefs");
  const { processBrief } = await import("@/lib/pipeline/brief");
  const { getDb, schema } = await import("@/lib/db");
  const simDraft = { ...draft, business_name: draft.business_name.startsWith("SIM ") ? draft.business_name : `SIM ${draft.business_name}` };
  console.log(`\nREQUIRE_LIVE_SERVICES=${process.env.REQUIRE_LIVE_SERVICES}`);
  const { briefId, created } = await createBriefFromDraft(simDraft, { ownerUserId: null, conversationId, transcript });
  console.log(`brief ${briefId} ${created ? "created" : "already existed"} — running processBrief (Linkup → Adaption → Dify)…`);
  const t0 = Date.now();
  await processBrief(briefId);
  console.log(`processBrief finished in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const db = getDb();
  const [b] = await db.select().from(schema.briefs).where(eq(schema.briefs.id, briefId));
  const sources = await db.select().from(schema.dataSources).where(eq(schema.dataSources.briefId, briefId));
  console.log(`\n=== Pipeline result ===\nstatus=${b.status} grounding=${b.groundingLevel}`);
  console.log("Linkup sources:");
  for (const s of sources.filter((x) => x.kind === "live")) console.log(`  - [${s.groundingLevel}${s.matchedCity ? ` ${s.matchedCity}` : ""}] ${s.title} — ${s.url}`);
  console.log("Adaption datasets:");
  for (const s of sources.filter((x) => x.kind === "synthetic")) console.log(`  - ${s.title} externalId=${s.externalId} pending=${s.pending} ${s.snippet ?? ""}`);
  if (!sources.some((x) => x.kind === "synthetic")) console.log("  (none)");
  console.log("Dify AI review:", JSON.stringify(b.aiReview, null, 2));
  console.log(`title(ja): ${b.content.ja.title}\ntitle(en): ${b.content.en.title}\nskills: ${b.skillsNeeded.join(", ")}`);
  console.log("\n=== scripts/inspect-latest.ts ===");
  spawnSync(process.execPath, [...process.execArgv, "scripts/inspect-latest.ts"], { stdio: "inherit" });
}

async function main() {
  const simAgentId = await ensureSimAgent();
  let ok = true;

  if (!args.has("--impact-only")) {
    const id = await dialogue({ label: "Interview", agentId: INTERVIEW!, vars: { user_id: "", business_id: "", locale: "ja" }, firstMessage: docFence("### 2.1 First message"), persona: INTERVIEW_PERSONA, simAgentId });
    const conv = await analyse(id);
    console.log("\nsummary:", conv.summary);
    console.log("data_collection_results:", JSON.stringify(conv.fields, null, 2));
    const problems = strictCheck("interview", conv.fields);
    const parsed = briefDraftSchema.safeParse(conv.fields);
    console.log(`briefDraftSchema: ${parsed.success ? "OK" : "FAILED " + JSON.stringify(parsed.error.issues)}`);
    console.log(problems.length ? `strict field problems:\n  ${problems.join("\n  ")}` : "strict field check: all 11 fields present and well-typed");
    if (parsed.success) console.log("parsed draft:", JSON.stringify(parsed.data, null, 2));
    ok &&= parsed.success && problems.length === 0;
    if (JSON_OUT)
      writeFileSync(JSON_OUT, JSON.stringify({ interview: { conversationId: id, fields: conv.fields, parsed: parsed.success ? parsed.data : null, problems, summary: conv.summary, transcript: conv.transcriptText } }, null, 2));
    if (parsed.success && !args.has("--no-pipeline")) await runPipeline(parsed.data, id, conv.transcriptText);
  }

  if (!args.has("--interview-only")) {
    const id = await dialogue({ label: "Impact review", agentId: IMPACT!, vars: { delivery_id: "sim-delivery", locale: "ja" }, firstMessage: docFence("### 3.1 First message"), persona: IMPACT_PERSONA, simAgentId });
    const conv = await analyse(id);
    console.log("\nsummary:", conv.summary);
    console.log("data_collection_results:", JSON.stringify(conv.fields, null, 2));
    const problems = strictCheck("impact", conv.fields);
    const parsed = impactDraftSchema.safeParse(conv.fields);
    console.log(`impactDraftSchema: ${parsed.success ? "OK" : "FAILED " + JSON.stringify(parsed.error.issues)}`);
    console.log(problems.length ? `strict field problems:\n  ${problems.join("\n  ")}` : "strict field check: all 6 fields present and well-typed");
    if (parsed.success) console.log("parsed draft:", JSON.stringify(parsed.data, null, 2));
    ok &&= parsed.success && problems.length === 0;
  }
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
