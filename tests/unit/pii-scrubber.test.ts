import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import { describe, expect, it } from "vitest";
import { briefReviewSchema } from "@/lib/integrations/dify";

/**
 * Property-style tests for the deterministic PII scrubber that runs INSIDE Dify (code node
 * "⑥ House rules & final recommendation" in dify/brief-review.yml). We run the exact Python that is
 * deployed — extracted from the DSL — with python3, feeding it simulated LLM outputs.
 * Skipped when python3 is not installed.
 */
const HAS_PY = spawnSync("python3", ["--version"]).status === 0;

type DslNode = { data: { type: string; code?: string; title?: string } };
function extractCode(): string {
  const dsl = yamlLoad(readFileSync("dify/brief-review.yml", "utf8")) as { workflow: { graph: { nodes: DslNode[] } } };
  const node = dsl.workflow.graph.nodes.find((n) => n.data.type === "code");
  if (!node?.data.code) throw new Error("no code node in dify/brief-review.yml");
  return node.data.code;
}

type Inputs = { pii: string; feasibility: string; grounding: string; normalized: string; grounding_level: string; brief: string; transcript: string };
type Lang = { title: string; problem: string; current_process: string; desired_outcome: string };
type Out = { recommendation: string; score: number; issues: string[]; pii_found: boolean; grounding_comment: string; skills_needed: string[]; normalized?: { ja: Lang; en: Lang } };

/** Run many cases in ONE python process (fast). */
function runPy(cases: Inputs[]): Out[] {
  const dir = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), "yk-pii-"));
  const file = path.join(dir, "merge.py");
  writeFileSync(
    file,
    `${extractCode()}\n\nimport sys as _sys\n_cases = json.loads(_sys.stdin.read())\nprint(json.dumps([json.loads(main(**c)["result"]) for c in _cases], ensure_ascii=False))\n`,
  );
  const r = spawnSync("python3", ["-I", file], { input: JSON.stringify(cases), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`python failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/* Deterministic PRNG so "random" cases are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const digits = (r: () => number, n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join("");

const SURNAMES = [["田中", "Tanaka"], ["佐藤", "Sato"], ["鈴木", "Suzuki"], ["高橋", "Takahashi"], ["渡辺", "Watanabe"], ["小野寺", "Onodera"]] as const;
const GIVEN = [["花子", "Hanako"], ["太郎", "Taro"], ["美穂", "Miho"], ["健一", "Kenichi"], ["千秋", "Chiaki"]] as const;
const BUSINESSES = [["麺屋ゆき", "Menya Yuki"], ["ゲストハウス雪あかり", "Guesthouse Yukiakari"], ["森野ファーム", "Morino Farm"]] as const;

const SCORES = { feasibility: JSON.stringify({ feasibility_score: 90, clarity_score: 90, issues: [], skills_needed: ["line-bot", "not-a-skill"] }), grounding: JSON.stringify({ grounding_score: 90, grounding_comment: "Exact match.", issues: [] }) };
const lang = (problem: string): Lang => ({ title: "予約対応", problem, current_process: "紙のノート", desired_outcome: "自動受付" });

function phoneFormats(r: () => number): { value: string; variant: string; digits: string } {
  const d = `0${pick(r, ["90", "80", "70"])}${digits(r, 8)}`;
  const [a, b, c] = [d.slice(0, 3), d.slice(3, 7), d.slice(7)];
  const formats = [`${a}-${b}-${c}`, d, `${a} ${b} ${c}`, `${a}ー${b}ー${c}`, `${a}－${b}－${c}`, `(${a})${b}-${c}`, `${a}.${b}.${c}`, `${a}‐${b}‐${c}`];
  return { value: pick(r, formats), variant: pick(r, formats), digits: d };
}
/** Remove the scrubber's separator class so a reformatted number can't hide from the check. */
const squash = (s: string) => s.replace(/[\s\u3000\-\u2010-\u2015\u30fc\uff0d().]/g, "");
const allText = (o: Out) => [JSON.stringify(o.normalized ?? {}), ...o.issues, o.grounding_comment].join("\n");

describe.skipIf(!HAS_PY)("Dify PII scrubber (Python from dify/brief-review.yml, run with python3)", () => {
  it("phone numbers: recall 100% across formats, even when the editor reformats the number", () => {
    const r = rng(1);
    const cases = Array.from({ length: 40 }, () => {
      const p = phoneFormats(r);
      const [biz] = pick(r, BUSINESSES);
      return {
        p,
        biz,
        input: {
          pii: JSON.stringify({ pii_values: [p.value], pii_items: [`customer phone number (${p.value})`] }),
          ...SCORES,
          normalized: JSON.stringify({ ja: lang(`${biz}の常連客(${p.variant})から予約が来ます。`), en: { ...lang(`Regulars call ${biz} on ${p.variant}.`), title: "Bookings" } }),
          grounding_level: "exact",
          brief: JSON.stringify({ problem: `予約は${p.value}に電話で来る` }),
          transcript: `Owner: 予約は${p.value}に電話で来ます。`,
        },
      };
    });
    const out = runPy(cases.map((c) => c.input));
    out.forEach((o, i) => {
      const { p, biz } = cases[i];
      expect(o.pii_found, `case ${i} ${p.value}`).toBe(true);
      expect(squash(allText(o)), `leak in case ${i}: ${p.value} / ${p.variant}`).not.toContain(p.digits);
      expect(o.normalized!.ja.problem).toContain("[連絡先]");
      expect(o.normalized!.en.problem).toContain("[contact]");
      expect(o.normalized!.ja.problem).toContain(biz); // the business name survives
      expect(o.recommendation).not.toBe("approve"); // PII forces revise
      expect(briefReviewSchema.safeParse(o).success).toBe(true);
    });
  });

  it("person names: kanji + every romanization/honorific variant is removed; business names are kept", () => {
    const r = rng(2);
    const cases = Array.from({ length: 30 }, () => {
      const [sj, se] = pick(r, SURNAMES);
      const [gj, ge] = pick(r, GIVEN);
      const [bj, be] = pick(r, BUSINESSES);
      const name = `${sj}${gj}`;
      const enVariant = pick(r, [`${ge} ${se}`, `${se} ${ge}`, `Ms. ${se}`, `${se}-san`, `${se.toUpperCase()} ${ge.toUpperCase()}`, `Mr ${ge} ${se}`]);
      const jaVariant = pick(r, [`${name}さん`, `${sj} ${gj}様`, `${name}`, `${sj}　${gj}氏`]);
      return {
        name,
        tokens: [se, ge].filter((t) => t.length >= 4),
        full: [`${ge} ${se}`, `${se} ${ge}`],
        bj,
        be,
        input: {
          pii: JSON.stringify({ pii_values: [name], pii_items: ["customer name"], pii_romaji: [{ value: name, romaji: [`${se} ${ge}`, `${ge} ${se}`] }] }),
          ...SCORES,
          normalized: JSON.stringify({ ja: lang(`${bj}では${jaVariant}の予約を手書きしています。`), en: lang(`${be} writes down ${enVariant}'s booking by hand.`) }),
          grounding_level: "exact",
          brief: JSON.stringify({ problem: `常連の${name}さんの予約` }),
          transcript: `Owner: 常連の${name}さんがいつも電話で予約します。`,
        },
      };
    });
    const out = runPy(cases.map((c) => c.input));
    out.forEach((o, i) => {
      const c = cases[i];
      const text = allText(o);
      expect(text, `case ${i}`).not.toContain(c.name);
      for (const t of c.tokens) expect(text.toLowerCase(), `case ${i}: ${t}`).not.toContain(t.toLowerCase());
      for (const f of c.full) expect(text.toLowerCase(), `case ${i}: ${f}`).not.toContain(f.toLowerCase());
      expect(o.normalized!.ja.problem, `business kept (ja) ${i}`).toContain(c.bj);
      expect(o.normalized!.en.problem, `business kept (en) ${i}`).toContain(c.be);
    });
  });

  it("emails are replaced with [contact] / [連絡先] and never echoed in issues", () => {
    const r = rng(3);
    const cases = Array.from({ length: 15 }, () => {
      const email = `${pick(r, ["taro", "hanako.s", "k_ono"])}${digits(r, 2)}@${pick(r, ["example.jp", "mail.example.com"])}`;
      return {
        email,
        input: {
          pii: JSON.stringify({ pii_values: [email], pii_items: [`customer email ${email}`] }),
          ...SCORES,
          normalized: JSON.stringify({ ja: lang(`${email}から問い合わせ`), en: lang(`Enquiries arrive from ${email}.`) }),
          grounding_level: "analog",
          brief: "{}",
          transcript: `Owner: お客様の ${email} から毎日メールが来ます`,
        },
      };
    });
    runPy(cases.map((c) => c.input)).forEach((o, i) => {
      expect(allText(o)).not.toContain(cases[i].email);
      expect(o.normalized!.en.problem).toContain("[contact]");
      expect(o.issues[0]).toMatch(/^Personal data found/);
    });
  });

  it("false positives: hallucinated values (not literally in the input) and mention-only briefs are NOT PII", () => {
    const mention = {
      pii: JSON.stringify({ pii_values: [], pii_items: [] }),
      ...SCORES,
      normalized: JSON.stringify({ ja: lang("お客様の電話番号をノートに控えています。"), en: lang("Customer phone numbers are kept in a notebook.") }),
      grounding_level: "exact",
      brief: JSON.stringify({ problem: "お客様の電話番号をノートに控えている" }),
      transcript: "Owner: 予約の名前と電話番号は紙のノートです。",
    };
    const hallucinated = { ...mention, pii: JSON.stringify({ pii_values: ["山田一郎", "090-0000-0000", "x"], pii_items: ["name", "phone", "?"] }) };
    const [a, b] = runPy([mention, hallucinated]);
    for (const o of [a, b]) {
      expect(o.pii_found).toBe(false);
      expect(o.recommendation).toBe("approve"); // high scores, exact grounding, no verified PII
      expect(o.normalized!.en.problem).toBe("Customer phone numbers are kept in a notebook.");
    }
  });

  it("house rules: ungrounded caps the score below 60 and never approves; national caps at 85; skills filtered", () => {
    const base = { pii: "{}", ...SCORES, normalized: "not json", brief: "{}", transcript: "" };
    const [ungrounded, national, exact] = runPy([
      { ...base, grounding_level: "ungrounded" },
      { ...base, grounding_level: "National" },
      { ...base, grounding_level: "exact" },
    ]);
    expect(ungrounded.score).toBeLessThanOrEqual(59);
    expect(ungrounded.recommendation).not.toBe("approve");
    expect(ungrounded.issues[0]).toMatch(/^Ungrounded/);
    expect(national.score).toBeLessThanOrEqual(85);
    expect(exact.score).toBe(90);
    expect(exact.skills_needed).toEqual(["line-bot"]); // "not-a-skill" dropped
    expect(exact.normalized).toBeUndefined(); // unparseable editor output is omitted, not passed through
    for (const o of [ungrounded, national, exact]) expect(briefReviewSchema.safeParse(o).success).toBe(true);
  });

  it("low scores reject; LLM chatter around JSON (```json fences) still parses", () => {
    const fenced = (o: object) => "Sure! Here you go:\n```json\n" + JSON.stringify(o) + "\n```";
    const [o] = runPy([
      {
        pii: fenced({ pii_values: [] }),
        feasibility: fenced({ feasibility_score: 10, clarity_score: 20, issues: ["Needs a licensed tax accountant."], skills_needed: [] }),
        grounding: fenced({ grounding_score: 30, grounding_comment: "Weak", issues: [] }),
        normalized: fenced({ ja: lang("税務申告"), en: lang("Tax filing") }),
        grounding_level: "national",
        brief: "{}",
        transcript: "",
      },
    ]);
    expect(o.recommendation).toBe("reject");
    expect(o.skills_needed).toEqual(["ai-automation"]); // default when none allowed
    expect(o.issues).toContain("Needs a licensed tax accountant.");
  });
});
