import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import { describe, expect, it } from "vitest";

/**
 * The deterministic business-name guard in Dify's "⑥ House rules" code node (dify/brief-review.yml),
 * run as the exact deployed Python with python3 (same harness as pii-scrubber.test.ts). Live evals
 * showed the English rewrite dropping the name ("a ramen shop in Sapporo") in 6/18 runs and the
 * Japanese side writing モリノファーム for 森野ファーム: the guard must repair both.
 */
const HAS_PY = spawnSync("python3", ["--version"]).status === 0;

type DslNode = { data: { type: string; code?: string } };
function extractCode(): string {
  const dsl = yamlLoad(readFileSync("dify/brief-review.yml", "utf8")) as { workflow: { graph: { nodes: DslNode[] } } };
  const node = dsl.workflow.graph.nodes.find((n) => n.data.type === "code");
  if (!node?.data.code) throw new Error("no code node in dify/brief-review.yml");
  return node.data.code;
}

type Lang = { title: string; problem: string; current_process: string; desired_outcome: string };
type Out = { recommendation: string; pii_found: boolean; normalized?: { ja: Lang; en: Lang } };
type Case = { meta?: string; brief?: string; editor: Record<string, unknown>; pii?: Record<string, unknown> };

function run(cases: Case[]): Out[] {
  const dir = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), "yk-name-"));
  const file = path.join(dir, "merge.py");
  writeFileSync(file, `${extractCode()}\n\nimport sys as _sys\n_cases = json.loads(_sys.stdin.read())\nprint(json.dumps([json.loads(main(**c)["result"]) for c in _cases], ensure_ascii=False))\n`);
  const inputs = cases.map((c) => ({
    pii: JSON.stringify(c.pii ?? { pii_values: [], pii_items: [] }),
    feasibility: JSON.stringify({ feasibility_score: 90, clarity_score: 90, issues: [], skills_needed: ["line-bot"] }),
    grounding: JSON.stringify({ grounding_score: 90, grounding_comment: "ok", issues: [] }),
    normalized: JSON.stringify(c.editor),
    grounding_level: "exact",
    brief: c.brief ?? "{}",
    transcript: "",
    ...(c.meta !== undefined ? { meta: c.meta } : {}),
  }));
  const r = spawnSync("python3", ["-I", file], { input: JSON.stringify(inputs), encoding: "utf8" });
  if (r.status !== 0) throw new Error(`python failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const L = (title: string, problem: string): Lang => ({ title, problem, current_process: "Paper notebook", desired_outcome: "Automatic replies" });
const meta = (business: string) => JSON.stringify({ business, city: "Sapporo", industry: "ramen" });

describe.skipIf(!HAS_PY)("Dify business-name guard (Python from dify/brief-review.yml)", () => {
  it("replaces a generic English description with the romanized name from business_name_en", () => {
    const [ramen, guest] = run([
      {
        meta: meta("麺屋ゆき"),
        editor: { business_name_ja: "麺屋ゆき", business_name_en: "Menya Yuki", ja: L("予約対応の自動化", "麺屋ゆきでは予約対応に週6時間かかっています。"), en: L("Automating reservations", "A ramen shop in Sapporo spends 6 hours a week on phone and LINE bookings.") },
      },
      {
        meta: meta("ゲストハウス雪あかり"),
        editor: { business_name_ja: "ゲストハウス雪あかり", business_name_en: "Guesthouse Yukiakari", ja: L("多言語メール返信", "ゲストハウス雪あかりでは海外客のメール対応に週4時間。"), en: L("Multilingual email replies", "The owner of a guesthouse near Otaru Canal answers foreign guests' emails by hand.") },
      },
    ]);
    expect(ramen.normalized!.en.problem).toBe("Menya Yuki in Sapporo spends 6 hours a week on phone and LINE bookings.");
    expect(guest.normalized!.en.problem).toBe("The owner of Guesthouse Yukiakari near Otaru Canal answers foreign guests' emails by hand.");
    // Japanese already had the name: untouched.
    expect(ramen.normalized!.ja.problem).toBe("麺屋ゆきでは予約対応に週6時間かかっています。");
  });

  it("prefixes the name when no generic phrase can be replaced, and leaves good output alone", () => {
    const [prefixed, good, inTitle] = run([
      { meta: meta("麺屋ゆき"), editor: { business_name_en: "Menya Yuki", ja: L("予約", "麺屋ゆきの予約。"), en: L("Bookings", "Reservations take 6 hours a week.") } },
      { meta: meta("麺屋ゆき"), editor: { business_name_en: "Menya Yuki", ja: L("予約", "麺屋ゆきの予約。"), en: L("Bookings", "At Menya Yuki, a ramen shop, bookings take 6 hours.") } },
      { meta: meta("麺屋ゆき"), editor: { business_name_en: "Menya Yuki", ja: L("麺屋ゆきの予約", "予約に週6時間。"), en: L("Menya Yuki: bookings", "A ramen shop spends 6 hours.") } },
    ]);
    expect(prefixed.normalized!.en.problem).toBe("Menya Yuki: Reservations take 6 hours a week.");
    expect(good.normalized!.en.problem).toBe("At Menya Yuki, a ramen shop, bookings take 6 hours.");
    expect(inTitle.normalized!.en.problem).toBe("A ramen shop spends 6 hours."); // already in the en title
    expect(inTitle.normalized!.ja.problem).toBe("予約に週6時間。"); // already in the ja title
  });

  it("restores the original Japanese name when the editor wrote a katakana variant", () => {
    const [farm, missing] = run([
      {
        meta: JSON.stringify({ business: "森野ファーム", city: "Obihiro", industry: "farm" }),
        editor: { business_name_ja: "モリノファーム", business_name_en: "Morino Farm", ja: L("受注のデジタル化", "モリノファームではFAXの注文を手で打ち直しています。"), en: L("Digitizing orders", "Morino Farm retypes fax orders into Excel.") },
      },
      {
        meta: JSON.stringify({ business: "森野ファーム" }),
        editor: { business_name_en: "Morino Farm", ja: L("受注のデジタル化", "FAXの注文を手で打ち直しています。"), en: L("Digitizing orders", "Morino Farm retypes fax orders.") },
      },
    ]);
    expect(farm.normalized!.ja.problem).toBe("森野ファームではFAXの注文を手で打ち直しています。");
    expect(missing.normalized!.ja.problem).toBe("森野ファーム：FAXの注文を手で打ち直しています。");
  });

  it("falls back to the draft title prefix when meta has no business, and to an ASCII name without business_name_en", () => {
    const brief = JSON.stringify({ ja: { title: "麺屋ゆき: 予約対応に週6時間", problem: "" }, en: { title: "", problem: "" } });
    const [fromTitle, ascii, nothing] = run([
      { meta: "{}", brief, editor: { business_name_en: "Menya Yuki", ja: L("予約", "予約に時間がかかる。"), en: L("Bookings", "A small ramen shop loses 6 hours.") } },
      { meta: JSON.stringify({ business: "Snow Works" }), editor: { ja: L("除雪", "Snow Worksの配車。"), en: L("Dispatch", "Our company dispatches plows by phone.") } },
      { editor: { ja: L("予約", "予約。"), en: L("Bookings", "A ramen shop loses time.") } }, // no meta at all (older callers)
    ]);
    expect(fromTitle.normalized!.en.problem).toBe("Menya Yuki loses 6 hours.");
    expect(fromTitle.normalized!.ja.problem).toBe("麺屋ゆき：予約に時間がかかる。");
    expect(ascii.normalized!.en.problem).toBe("Snow Works dispatches plows by phone.");
    expect(nothing.normalized!.en.problem).toBe("A ramen shop loses time.");
  });

  it("does not turn 'the shop owner' into '<name> owner'", () => {
    const [o] = run([{ meta: meta("麺屋ゆき"), editor: { business_name_en: "Menya Yuki", ja: L("予約", "麺屋ゆき"), en: L("Bookings", "The shop owner answers every call.") } }]);
    expect(o.normalized!.en.problem).toBe("Menya Yuki: The shop owner answers every call.");
  });

  it("PII scrubbing still wins over the name guard", () => {
    const [o] = run([
      {
        meta: meta("麺屋ゆき"),
        pii: { pii_values: ["田中花子"], pii_items: ["customer name"], pii_romaji: [{ value: "田中花子", romaji: ["Hanako Tanaka"] }] },
        brief: JSON.stringify({ ja: { title: "x", problem: "常連の田中花子さん" } }),
        editor: { business_name_en: "Menya Yuki", ja: L("予約", "麺屋ゆきの常連、田中花子さんの予約。"), en: L("Bookings", "Our shop takes Hanako Tanaka's bookings by phone.") },
      },
    ]);
    expect(o.pii_found).toBe(true);
    expect(JSON.stringify(o.normalized)).not.toMatch(/田中花子|Hanako|Tanaka/);
    expect(o.normalized!.en.problem).toBe("Menya Yuki takes a customer's bookings by phone.");
    expect(o.normalized!.ja.problem).toContain("麺屋ゆき");
  });
});
