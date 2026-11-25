import "./load-env";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * `pnpm setup:elevenlabs` — create (or update) the two Yukikaki voice agents from
 * docs/elevenlabs-agents.md (first messages, system prompts, data-collection fields),
 * then write their ids into .env.local. Idempotent: agents are matched by name.
 */
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY missing in .env.local");
const API = "https://api.elevenlabs.io";
const VOICE_SEARCH = process.env.ELEVENLABS_VOICE_SEARCH ?? "Kaori";

async function el<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { "xi-api-key": KEY!, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/* ── Parse the doc ── */
const doc = readFileSync("docs/elevenlabs-agents.md", "utf8");
function fenceAfter(heading: string): string {
  const i = doc.indexOf(heading);
  if (i < 0) throw new Error(`heading not found: ${heading}`);
  const m = doc.slice(i).match(/```\n([\s\S]*?)```/);
  if (!m) throw new Error(`no code block after ${heading}`);
  return m[1].trim();
}
function tableAfter(heading: string) {
  const i = doc.indexOf(heading);
  const lines = doc.slice(i).split("\n");
  const start = lines.findIndex((l) => /^\|\s*`/.test(l));
  const out: Record<string, { type: "string" | "number" | "boolean" | "integer"; description: string }> = {};
  for (const r of lines.slice(start)) {
    if (!/^\|\s*`/.test(r)) break; // only the first contiguous table
    const cells = r.split("|").map((c) => c.trim());
    out[cells[1].replace(/`/g, "")] = { type: cells[2].toLowerCase() as "string", description: cells[3] };
  }
  return out;
}

const AGENTS = [
  {
    name: "Yukikaki Interview",
    envVar: "ELEVENLABS_INTERVIEW_AGENT_ID",
    firstMessage: fenceAfter("### 2.1 First message"),
    prompt: fenceAfter("### 2.2 System prompt"),
    dataCollection: tableAfter("### 2.3 Data collection fields"),
    maxSeconds: 900,
    vars: { user_id: "", business_id: "", locale: "ja" },
  },
  {
    name: "Yukikaki Impact Review",
    envVar: "ELEVENLABS_IMPACT_AGENT_ID",
    firstMessage: fenceAfter("### 3.1 First message"),
    prompt: fenceAfter("### 3.2 System prompt"),
    dataCollection: tableAfter("### 3.3 Data collection fields"),
    maxSeconds: 300,
    vars: { delivery_id: "", locale: "ja" },
  },
];

async function pickVoice(): Promise<string> {
  const mine = await el<{ voices: { voice_id: string; name: string }[] }>(`/v2/voices?search=${encodeURIComponent(VOICE_SEARCH)}`);
  if (mine.voices?.length) return mine.voices[0].voice_id;
  const shared = await el<{ voices: { voice_id: string; public_owner_id: string; name: string }[] }>(
    `/v1/shared-voices?page_size=5&language=ja&use_cases=conversational&search=${encodeURIComponent(VOICE_SEARCH)}`,
  );
  const v = shared.voices?.[0];
  if (!v) throw new Error(`no Japanese voice matching ${VOICE_SEARCH}`);
  const added = await el<{ voice_id: string }>(`/v1/voices/add/${v.public_owner_id}/${v.voice_id}`, {
    method: "POST",
    body: JSON.stringify({ new_name: `Yukikaki – ${v.name.split(" - ")[0]}` }),
  });
  console.log(`· added shared voice "${v.name}" to the library`);
  return added.voice_id;
}

async function main() {
  const voiceId = await pickVoice();
  const existing = await el<{ agents: { agent_id: string; name: string }[] }>(`/v1/convai/agents?page_size=100`);
  const ids: Record<string, string> = {};
  for (const a of AGENTS) {
    const body = {
      name: a.name,
      tags: ["yukikaki"],
      conversation_config: {
        agent: {
          language: "ja",
          first_message: a.firstMessage,
          dynamic_variables: { dynamic_variable_placeholders: a.vars },
          prompt: {
            prompt: a.prompt,
            llm: "gemini-2.5-flash",
            temperature: 0.4,
            // System tool so the agent can hang up itself after its goodbye.
            built_in_tools: {
              end_call: {
                type: "system",
                name: "end_call",
                description:
                  "End the call right after you have said your closing goodbye and the user has nothing more to add, or when the user clearly says they want to stop.",
                params: { system_tool_type: "end_call" },
              },
            },
          },
        },
        tts: { model_id: "eleven_flash_v2_5", voice_id: voiceId },
        conversation: { max_duration_seconds: a.maxSeconds },
        turn: { turn_eagerness: "patient" },
      },
      platform_settings: {
        auth: { enable_auth: true },
        data_collection: a.dataCollection,
        summary_language: "ja",
      },
    };
    const found = existing.agents?.find((x) => x.name === a.name);
    let id: string;
    if (found) {
      await el(`/v1/convai/agents/${found.agent_id}`, { method: "PATCH", body: JSON.stringify(body) });
      id = found.agent_id;
      console.log(`✓ updated ${a.name} (${id})`);
    } else {
      id = (await el<{ agent_id: string }>(`/v1/convai/agents/create`, { method: "POST", body: JSON.stringify(body) })).agent_id;
      console.log(`✓ created ${a.name} (${id}) with ${Object.keys(a.dataCollection).length} data-collection fields`);
    }
    ids[a.envVar] = id;
  }
  let env = readFileSync(".env.local", "utf8");
  for (const [k, v] of Object.entries(ids)) {
    env = new RegExp(`^${k}=`, "m").test(env) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : env + `\n${k}=${v}\n`;
  }
  writeFileSync(".env.local", env);
  console.log("✓ agent ids written to .env.local");
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
