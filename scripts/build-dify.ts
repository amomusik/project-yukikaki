/**
 * `pnpm dify:build` — generates the importable Dify workflow DSL files in dify/.
 * Edit the steps here, rebuild, then re-import (Studio → Import DSL) in Dify.
 *
 * Contract with the app (lib/integrations/dify.ts): the End node outputs ONE
 * variable `result` holding JSON text. Dify only recommends; hosts decide.
 */
import { writeFileSync } from "node:fs";
import yaml from "js-yaml";

const MODEL = { provider: "langgenius/openai/openai", name: "gpt-4o-mini", mode: "chat", completion_params: { temperature: 0.2 } };
const SKILLS =
  "ai-automation, spreadsheets, line-bot, booking-automation, email-automation, inventory, bookkeeping, social-media, translation, paperwork-automation, web, data-analysis";
const CONTEXT =
  "Project Yukikaki (雪かき) is a municipal program in Japan. Small business owners describe a bureaucratic or menial task; teams of 2–6 AI-capable students build a fix in 2–6 weeks. A human town host makes every decision — you only advise.";

type Node = { id: string; title: string; desc: string; data: Record<string, unknown> };
type Input = { variable: string; label: string };

const X0 = 60;
const DX = 320;

function startNode(id: string, title: string, desc: string, inputs: Input[]): Node {
  return {
    id,
    title,
    desc,
    data: {
      type: "start",
      variables: inputs.map((v) => ({ variable: v.variable, label: v.label, type: "paragraph", required: true, max_length: 100000, options: [] })),
    },
  };
}

function llmNode(id: string, title: string, desc: string, system: string, user: string): Node {
  return {
    id,
    title,
    desc,
    data: {
      type: "llm",
      model: MODEL,
      context: { enabled: false, variable_selector: [] },
      vision: { enabled: false },
      variables: [],
      prompt_template: [
        { id: `${id}-system`, role: "system", text: system },
        { id: `${id}-user`, role: "user", text: user },
      ],
    },
  };
}

function codeNode(id: string, title: string, desc: string, inputs: [string, string[]][], code: string, outputs: string[]): Node {
  return {
    id,
    title,
    desc,
    data: {
      type: "code",
      code_language: "python3",
      code,
      variables: inputs.map(([variable, value_selector]) => ({ variable, value_selector })),
      outputs: Object.fromEntries(outputs.map((o) => [o, { type: "string", children: null }])),
    },
  };
}

function endNode(id: string, title: string, desc: string, from: string): Node {
  return { id, title, desc, data: { type: "end", outputs: [{ variable: "result", value_selector: [from, "result"] }] } };
}

function app(name: string, description: string, nodes: Node[]) {
  const edges = nodes.slice(1).map((n, i) => {
    const prev = nodes[i];
    return {
      id: `${prev.id}-source-${n.id}-target`,
      source: prev.id,
      sourceHandle: "source",
      target: n.id,
      targetHandle: "target",
      type: "custom",
      zIndex: 0,
      data: { isInIteration: false, isInLoop: false, sourceType: prev.data.type, targetType: n.data.type },
    };
  });
  return {
    app: { name, description, mode: "workflow", icon: "❄️", icon_background: "#E0F2FE", use_icon_as_answer_icon: false },
    // No pinned plugin version: Dify Cloud ships the OpenAI provider, and a pin
    // here makes the importer offer to DOWNGRADE the installed plugin.
    dependencies: [],
    kind: "app",
    version: "0.1.5",
    workflow: {
      conversation_variables: [],
      environment_variables: [],
      features: {
        file_upload: { enabled: false, image: { enabled: false, number_limits: 3, transfer_methods: ["local_file", "remote_url"] } },
        opening_statement: "",
        retriever_resource: { enabled: false },
        sensitive_word_avoidance: { enabled: false },
        speech_to_text: { enabled: false },
        suggested_questions: [],
        suggested_questions_after_answer: { enabled: false },
        text_to_speech: { enabled: false, language: "", voice: "" },
      },
      graph: {
        edges,
        nodes: nodes.map((n, i) => {
          const pos = { x: X0 + i * DX, y: i % 2 === 0 ? 260 : 340 };
          return {
            id: n.id,
            type: "custom",
            data: { ...n.data, title: n.title, desc: n.desc, selected: false },
            position: pos,
            positionAbsolute: pos,
            sourcePosition: "right",
            targetPosition: "left",
            selected: false,
            width: 244,
            height: n.data.type === "start" ? 194 : 98,
          };
        }),
        viewport: { x: 0, y: 0, zoom: 0.7 },
      },
    },
  };
}

/** Shared Python helper: pull the first JSON object out of an LLM answer. */
const PY_PARSE = `import json, re

def parse(text):
    if not text:
        return {}
    m = re.search(r"\`\`\`(?:json)?\\s*([\\s\\S]*?)\`\`\`", text)
    body = m.group(1) if m else text
    s, e = body.find("{"), body.rfind("}")
    if s == -1 or e <= s:
        return {}
    try:
        return json.loads(body[s:e + 1])
    except Exception:
        return {}
`;

/** PII scrubbing helpers for the brief house-rules node (String.raw: backslashes reach Python verbatim). */
const PY_PII = String.raw`
SEP = r"[\s\u3000\-\u2010-\u2015\u30fc\uff0d().]*"
HONORIFIC_EN = r"(?:(?<![A-Za-z])(?:Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s+)?"
SUFFIX_EN = r"(?:[\s\-]?(?:san|sama|chan|kun|sensei|shi))?"
SUFFIX_JA = r"(?:さん|様|さま|ちゃん|くん|君|氏|殿)?"
CONTACT_RE = re.compile(r"[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+|(?<!\d)\+?\d[\d\s\-\u2010-\u2015\u30fc\uff0d().]{7,}\d(?!\d)")


def is_contact(v):
    if "@" in v:
        return True
    digits = re.sub(r"\D", "", v)
    return len(digits) >= 7 and re.fullmatch(r"[\d\s+\-\u2010-\u2015\u30fc\uff0d().]+", v) is not None


def value_pattern(v):
    if is_contact(v) and "@" not in v:
        digits = re.sub(r"\D", "", v)
        return re.compile(r"(?<!\d)" + SEP.join(digits) + r"(?!\d)")
    parts = [re.escape(t) for t in v.split()]
    if all(ord(c) < 128 for c in v):
        body = r"[\s\-.,']*".join(parts)
        return re.compile(HONORIFIC_EN + r"(?<![A-Za-z0-9])" + body + r"(?![A-Za-z0-9])" + SUFFIX_EN, re.I)
    return re.compile(r"[\s\u3000]*".join(parts) + SUFFIX_JA)


def romaji_patterns(r):
    tokens = re.findall(r"[A-Za-z]+", r)
    if not tokens:
        return []
    pats = [(len(r), re.compile(HONORIFIC_EN + r"(?<![A-Za-z])" + r"[\s\-.,']*".join(re.escape(t) for t in tokens) + r"(?![A-Za-z])" + SUFFIX_EN, re.I))]
    if len(tokens) > 1:
        # Single name parts ("Ms. Tanaka") would still identify the person.
        for t in tokens:
            if len(t) >= 4:
                pats.append((len(t), re.compile(HONORIFIC_EN + r"(?<![A-Za-z])" + re.escape(t) + r"(?![A-Za-z])" + SUFFIX_EN, re.I)))
    return pats


def build_scrubbers(p, values, verified):
    """Returns [(compiled pattern, is_contact)] longest-first for verified values and their romaji."""
    out = []
    ver_values = [values[i] for i in verified]
    for v in ver_values:
        out.append((len(v), value_pattern(v), is_contact(v)))
    names = [v for v in ver_values if not is_contact(v)]
    has_ja_name = any(any(ord(c) >= 128 for c in v) for v in names)
    for entry in (p.get("pii_romaji", []) or []):
        forms = []
        if isinstance(entry, dict):
            if str(entry.get("value", "")).strip() in names:
                rr = entry.get("romaji", [])
                forms = [rr] if isinstance(rr, str) else list(rr or [])
        elif isinstance(entry, str) and has_ja_name:
            forms = [entry]
        for r in forms:
            r = str(r).strip()
            if len(r) >= 2:
                for size, pat in romaji_patterns(r):
                    out.append((size, pat, False))
    out.sort(key=lambda x: -x[0])
    return [(pat, c) for _, pat, c in out]


def scrub(text, scrubbers, lang):
    if not isinstance(text, str):
        return text
    for pat, contact in scrubbers:
        if lang == "ja":
            rep = "[連絡先]" if contact else "お客様"
        else:
            rep = "[contact]" if contact else "a customer"
        text = pat.sub(rep, text)
    return text


def clean_item(item, scrubbers):
    for pat, _ in scrubbers:
        item = pat.sub("", item)
    item = CONTACT_RE.sub("", item)
    item = re.sub(r"[\(（\[［]\s*[\)）\]］]", "", item)
    item = re.sub(r"\s+", " ", item).strip(" :：,、;-–—")
    return item or "personal data"
`;

/* ───────────────────────── Brief review ───────────────────────── */
const B = { start: "1732500000001", pii: "1732500000002", feas: "1732500000003", ground: "1732500000004", norm: "1732500000005", merge: "1732500000006", end: "1732500000007" };
const S = (v: string) => `{{#${B.start}.${v}#}}`;

const briefNodes: Node[] = [
  startNode(B.start, "① Intake — brief from Yukikaki", "Payload sent by the Yukikaki server after the interview and grounding search.", [
    { variable: "brief", label: "Brief draft (JSON ja/en)" },
    { variable: "transcript", label: "Interview transcript" },
    { variable: "sources", label: "Grounding sources (Linkup / pre-fetched)" },
    { variable: "grounding_level", label: "Grounding level (exact / analog / national / ungrounded)" },
    { variable: "meta", label: "Business meta (city, industry, hours lost, tools)" },
  ]),
  llmNode(
    B.pii,
    "② Privacy scan",
    "Lists exact personal-data values (names, phones, emails, addresses, health/financial details). The house-rules step keeps only values that literally appear in the interview; the editor removes them.",
    `${CONTEXT}\n\nYou are the PRIVACY OFFICER. Find personal data of private individuals in the brief and transcript: names of customers/staff/residents, phone numbers, personal emails, home addresses, health, financial or immigration details. The business name and public institutions are NOT personal data.\n\nOnly flag PII when an actual identifying VALUE appears in the text: a real person's name, a phone number, an email address, a street/home address, or a concrete health/financial/immigration detail about an identifiable person. A mere MENTION that private data exists (e.g. \"we keep customer phone numbers in a notebook\", \"reservations include names\", \"staff health records\") is NOT PII — the brief needs to describe such data to explain the problem. If no actual value appears, return empty lists.\n\nFor every value you flag, copy the EXACT substring from the input into pii_values (character for character) — the system verifies each value literally appears in the input and discards anything that does not.\n\nFor every flagged PERSON NAME, also list its common romanizations (Hepburn, both name orders, with and without long-vowel marks) in pii_romaji, e.g. {\"value\": \"田中花子\", \"romaji\": [\"Tanaka Hanako\", \"Hanako Tanaka\"]}. pii_items must be category words ONLY — never include the value itself (write 'customer phone number', not 'customer phone number (090-…)').\n\nReturn ONE JSON object only:\n{"pii_values": ["exact substring copied from the input"], "pii_items": ["short category description of each value, e.g. 'customer name'"], "pii_romaji": [{"value": "exact name value from pii_values", "romaji": ["romanized forms"]}]}`,
    `Brief:\n${S("brief")}\n\nTranscript:\n${S("transcript")}`,
  ),
  llmNode(
    B.feas,
    "③ Student-scope feasibility check",
    "Can a 2–6 person student team ship something useful in 2–6 weeks with everyday tools? Picks the skills needed.",
    `${CONTEXT}\n\nYou are the PROGRAM MANAGER. Judge feasibility for a student team (2–6 people, 2–6 weeks, everyday tools: spreadsheets, LINE bots, booking/email automation, simple web apps, AI assistants). Flag scope that is too big, needs licensed professionals (tax accountants, lawyers, doctors), or needs systems students cannot access.\n\nChoose skills_needed ONLY from: ${SKILLS}\n\nReturn ONE JSON object only:\n{"feasibility_score": 0-100, "clarity_score": 0-100, "issues": ["short actionable English sentences"], "skills_needed": ["..."], "suggested_scope": "one sentence MVP"}`,
    `Brief:\n${S("brief")}\n\nMeta:\n${S("meta")}`,
  ),
  llmNode(
    B.ground,
    "④ Grounding quality audit",
    "Checks the real-world sources: exact city → analog city → national → ungrounded. Flags irrelevant sources.",
    `${CONTEXT}\n\nYou are the RESEARCH AUDITOR. Synthetic stand-in data may only be generated when the brief is grounded in real sources. Levels: "exact" = same city & industry (good); "analog" = similar city by climate/snow/size or adjacent industry (acceptable, say which); "national" = national statistics only (weaker); "ungrounded" = nothing real (serious issue).\n\nCheck whether each listed source is actually relevant to the problem.\n\nReturn ONE JSON object only:\n{"grounding_score": 0-100, "relevant_sources": 0, "irrelevant_sources": 0, "grounding_comment": "1–2 English sentences for the town host", "issues": ["..."]}`,
    `Grounding level: ${S("grounding_level")}\n\nSources:\n${S("sources")}\n\nMeta:\n${S("meta")}`,
  ),
  llmNode(
    B.norm,
    "⑤ Bilingual editor (日本語 / English)",
    "Rewrites the brief into clear, publishable Japanese (です・ます) and English, removing the exact personal-data values found in step ②.",
    `${CONTEXT}\n\nYou are the BILINGUAL EDITOR. Rewrite the brief so a student who never met the owner understands it. Keep the owner's meaning, be concise and concrete, fill in the missing language by translating. Remove ONLY the exact personal-data values listed (replace them with a generic word such as 「お客様」/"a customer"); keep everything else, including statements that private data exists. Japanese: natural, polite です・ます調. Title ≤ 40 characters. Business names, shop names, product names and other proper nouns must be kept exactly as-is or romanized (e.g. 雪あかり → Yukiakari in English, and the original 雪あかり in Japanese) — never translate their meaning, replace them, or invent a different name.\n\nReturn ONE JSON object only:\n{"ja": {"title": "", "problem": "", "current_process": "", "desired_outcome": ""}, "en": {"title": "", "problem": "", "current_process": "", "desired_outcome": ""}}`,
    `Brief:\n${S("brief")}\n\nPersonal-data values to remove (JSON from the privacy scan):\n{{#${B.pii}.text#}}`,
  ),
  codeNode(
    B.merge,
    "⑥ House rules & final recommendation",
    "Deterministic merge: weights the scores, caps ungrounded briefs below 60, forces 'revise' when PII was found, deterministically scrubs verified PII (and its romaji) from the brief text and issues, and emits the JSON the app expects.",
    [
      ["pii", [B.pii, "text"]],
      ["feasibility", [B.feas, "text"]],
      ["grounding", [B.ground, "text"]],
      ["normalized", [B.norm, "text"]],
      ["grounding_level", [B.start, "grounding_level"]],
      ["brief", [B.start, "brief"]],
      ["transcript", [B.start, "transcript"]],
    ],
    `${PY_PARSE}${PY_PII}
ALLOWED = {${SKILLS.split(", ").map((s) => `"${s}"`).join(", ")}}


def main(pii: str, feasibility: str, grounding: str, normalized: str, grounding_level: str, brief: str, transcript: str) -> dict:
    p, f, g, n = parse(pii), parse(feasibility), parse(grounding), parse(normalized)
    level = (grounding_level or "").strip().lower()
    feas = float(f.get("feasibility_score", 50) or 50)
    clar = float(f.get("clarity_score", 50) or 50)
    grnd = float(g.get("grounding_score", 50) or 50)
    score = round(0.45 * feas + 0.25 * clar + 0.30 * grnd)
    issues = list(f.get("issues", []) or []) + list(g.get("issues", []) or [])
    # Deterministic guard: only values that literally appear in the input count as PII.
    haystack = (brief or "") + " " + (transcript or "")
    values = [str(v).strip() for v in (p.get("pii_values", []) or [])]
    items = [str(i) for i in (p.get("pii_items", []) or [])]
    verified = [i for i, v in enumerate(values) if len(v) >= 2 and v in haystack]
    pii_found = len(verified) > 0
    scrubbers = build_scrubbers(p, values, verified) if pii_found else []
    if pii_found:
        kinds = []
        for i in verified:
            k = clean_item(items[i], scrubbers) if i < len(items) else "personal data"
            if k not in kinds:
                kinds.append(k)
        issues.insert(0, "Personal data found in the interview; it was removed from the published brief: " + "; ".join(kinds))
    if level == "ungrounded":
        score = min(score, 59)
        issues.insert(0, "Ungrounded: no real-world sources were found, so no stand-in data was generated.")
    elif level == "national":
        score = min(score, 85)
    if score >= 75 and not pii_found and level != "ungrounded":
        rec = "approve"
    elif score < 40:
        rec = "reject"
    else:
        rec = "revise"
    skills = [s for s in (f.get("skills_needed", []) or []) if s in ALLOWED] or ["ai-automation"]
    if f.get("suggested_scope"):
        issues.append("Suggested MVP: " + str(f["suggested_scope"]))
    out = {
        "recommendation": rec,
        "score": max(0, min(100, score)),
        "issues": [scrub(str(i), scrubbers, "en") for i in issues if i][:8],
        "pii_found": pii_found,
        "grounding_comment": scrub(str(g.get("grounding_comment", "")), scrubbers, "en"),
        "skills_needed": skills,
    }
    keys = ("title", "problem", "current_process", "desired_outcome")
    if all(isinstance(n.get(l), dict) and all(isinstance(n[l].get(k), str) for k in keys) for l in ("ja", "en")):
        out["normalized"] = {l: {k: scrub(n[l][k], scrubbers, l) for k in keys} for l in ("ja", "en")}
    return {"result": json.dumps(out, ensure_ascii=False)}
`,
    ["result"],
  ),
  endNode(B.end, "⑦ Return to Yukikaki admin", "Single output `result` (JSON text). The host sees it as an advisory badge; only the host can approve.", B.merge),
];

/* ───────────────────────── Team review ───────────────────────── */
const T = { start: "1732600000001", roster: "1732600000002", fit: "1732600000003", plan: "1732600000004", merge: "1732600000005", end: "1732600000006" };

const teamNodes: Node[] = [
  startNode(T.start, "① Intake — team application", "A student team applying for an approved challenge.", [
    { variable: "brief", label: "Challenge (JSON: title, problem, skills_needed)" },
    { variable: "team", label: "Team (JSON: name, pitch)" },
    { variable: "members", label: "Members (JSON: name, role lead|member, skills)" },
  ]),
  codeNode(
    T.roster,
    "② Roster & lead check",
    "Deterministic: exactly one lead (the business owner's point of contact), team size 1–6, skill coverage vs. the brief.",
    [
      ["brief", [T.start, "brief"]],
      ["members", [T.start, "members"]],
    ],
    `import json


def main(brief: str, members: str) -> dict:
    try:
        m = json.loads(members or "[]")
    except Exception:
        m = []
    try:
        b = json.loads(brief or "{}")
    except Exception:
        b = {}
    leads = [x for x in m if str(x.get("role")) == "lead"]
    have = set()
    for x in m:
        for s in x.get("skills", []) or []:
            have.add(str(s))
    need = [str(s) for s in (b.get("skills_needed", []) or [])]
    covered = [s for s in need if s in have]
    missing = [s for s in need if s not in have]
    issues = []
    if len(leads) != 1:
        issues.append("Team must have exactly one lead (found %d)." % len(leads))
    if len(m) > 6:
        issues.append("Team is larger than 6 people.")
    if missing:
        issues.append("Skills not covered by the team: " + ", ".join(missing))
    coverage = round(100 * len(covered) / len(need)) if need else 100
    return {"result": json.dumps({"lead_named": len(leads) == 1, "size": len(m), "coverage": coverage, "issues": issues})}
`,
    ["result"],
  ),
  llmNode(
    T.fit,
    "③ Skill-fit assessment",
    "Does this team have what it takes for this specific challenge?",
    `${CONTEXT}\n\nYou are the MENTOR matching student teams to challenges. Judge whether the members' skills fit the challenge, and whether someone can own support for the business owner after delivery (the lead).\n\nReturn ONE JSON object only:\n{"fit_score": 0-100, "issues": ["short English sentences"]}`,
    `Challenge:\n{{#${T.start}.brief#}}\n\nMembers:\n{{#${T.start}.members#}}\n\nRoster check:\n{{#${T.roster}.result#}}`,
  ),
  llmNode(
    T.plan,
    "④ Pitch & delivery-plan review",
    "Is the pitch concrete, realistic in 2–6 weeks, and safe for the business (no access to private data it shouldn't have)?",
    `${CONTEXT}\n\nYou are the PROGRAM MANAGER. Review the team's pitch: is it concrete, realistic for 2–6 weeks, maintainable by a small business afterwards, and respectful of the owner's data (use synthetic stand-in data until trust is established)?\n\nReturn ONE JSON object only:\n{"plan_score": 0-100, "issues": ["short English sentences"]}`,
    `Challenge:\n{{#${T.start}.brief#}}\n\nTeam & pitch:\n{{#${T.start}.team#}}`,
  ),
  codeNode(
    T.merge,
    "⑤ House rules & final recommendation",
    "Deterministic merge: no lead → never 'approve'; weights fit, plan and skill coverage.",
    [
      ["roster", [T.roster, "result"]],
      ["fit", [T.fit, "text"]],
      ["plan", [T.plan, "text"]],
    ],
    `${PY_PARSE}

def main(roster: str, fit: str, plan: str) -> dict:
    r, f, p = parse(roster), parse(fit), parse(plan)
    score = round(0.4 * float(f.get("fit_score", 50) or 50) + 0.35 * float(p.get("plan_score", 50) or 50) + 0.25 * float(r.get("coverage", 50) or 50))
    lead = bool(r.get("lead_named", False))
    issues = list(r.get("issues", []) or []) + list(f.get("issues", []) or []) + list(p.get("issues", []) or [])
    if not lead:
        score = min(score, 50)
    rec = "approve" if score >= 70 and lead else ("reject" if score < 35 else "revise")
    out = {"recommendation": rec, "score": max(0, min(100, score)), "issues": [str(i) for i in issues if i][:8], "lead_named": lead}
    return {"result": json.dumps(out, ensure_ascii=False)}
`,
    ["result"],
  ),
  endNode(T.end, "⑥ Return to Yukikaki admin", "Single output `result` (JSON text). Advisory only — the host approves the team.", T.merge),
];

const header = "# Generated by scripts/build-dify.ts — edit that file and run `pnpm dify:build`.\n";
writeFileSync(
  "dify/brief-review.yml",
  header +
    yaml.dump(
      app(
        "Yukikaki · Brief Review",
        "Project Yukikaki — 6-step AI pre-review of a challenge brief: privacy redaction, student-scope feasibility, grounding audit, bilingual editing and house rules. Advisory only; the town host decides.",
        briefNodes,
      ),
      { lineWidth: -1, noRefs: true },
    ),
);
writeFileSync(
  "dify/team-review.yml",
  header +
    yaml.dump(
      app(
        "Yukikaki · Team Review",
        "Project Yukikaki — 5-step AI pre-review of a student team: roster & lead check, skill fit, pitch review and house rules. Advisory only; the town host decides.",
        teamNodes,
      ),
      { lineWidth: -1, noRefs: true },
    ),
);
console.log("✓ wrote dify/brief-review.yml (7 steps) and dify/team-review.yml (6 steps)");
