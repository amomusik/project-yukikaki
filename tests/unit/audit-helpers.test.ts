import { describe, expect, it } from "vitest";
import { collectI18nUsage, collectTransitionSites, extractBlock, reactFindings } from "@/scripts/audit-orphans";

describe("orphan audit heuristics (scripts/audit-orphans.ts)", () => {
  it("resolves t() calls to the nearest preceding namespace binding and flags dynamic keys", () => {
    const files = new Map([
      [
        "a.tsx",
        `async function A() { const t = await getTranslations("meta"); return t("title"); }
         async function B() { const t = await getTranslations("landing"); t.rich("hero"); t(\`ws\${n}\`); t(key); }
         function C() { const tc = useTranslations("common"); return tc.has("skills.x") ? tc("skills.x") : null; }`,
      ],
    ]);
    const u = collectI18nUsage(files);
    expect([...u.static.keys()].sort()).toEqual(["common.skills.x", "landing.hero", "meta.title"]);
    expect(u.dynamic.map((d) => d.prefix)).toEqual(["landing.ws", "landing."]);
  });

  it("finds effects that start listeners/observers/timers without cleanup, and unused state", () => {
    const leaky = `
      const [open, setOpen] = useState(false);
      const [count] = useState(0);
      useEffect(() => { window.addEventListener("scroll", onScroll); const id = setInterval(tick, 1000); }, []);
      useEffect(() => { const io = new IntersectionObserver(cb); io.observe(el); return () => io.disconnect(); }, []);
      useEffect(() => { window.addEventListener("resize", f); return () => {}; }, []);
      return <div onClick={() => setOpen(true)}>{count}</div>;`;
    const f = reactFindings("x.tsx", leaky);
    const cats = f.map((x) => `${x.category}@${x.where}`);
    expect(cats).toContain("react: effect without cleanup@x.tsx:4");
    expect(cats).toContain("react: incomplete effect cleanup@x.tsx:6"); // listener added, never removed
    expect(cats).toContain("react: state never read@x.tsx:2"); // `open` is never read
    expect(cats).toContain("react: state never set@x.tsx:3");
    expect(cats.filter((c) => c.endsWith(":5"))).toEqual([]); // observer properly disconnected
    expect(extractBlock("{ a { b } c } d", 0)).toBe("{ a { b } c }");
  });

  it("collects status transition call sites and resolves ternary targets", () => {
    const files = new Map([
      [
        "lib/x.ts",
        `export async function decide() {
           const to = input.decision === "approve" ? "approved" : "rejected";
           await setBriefStatus(brief.id, brief.status, to);
         }
         export async function dead() { await setBriefStatus(id, "rejected", "in_review"); }
         async function t() { assertTransition("team", team.status, "delivered"); await tx.update(schema.teams).set({ status: "delivered" }); }`,
      ],
    ]);
    const sites = collectTransitionSites(files, new Set(["dead"]));
    expect(sites.filter((s) => s.entity === "brief").map((s) => [s.from, s.to, s.fn])).toEqual([
      [null, "approved", "decide"],
      [null, "rejected", "decide"],
      ["rejected", "in_review", "dead (UNREACHABLE: no callers)"],
    ]);
    expect(sites.find((s) => s.entity === "team")).toMatchObject({ to: "delivered" });
  });
});
