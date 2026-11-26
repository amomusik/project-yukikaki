import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility smoke: public pages must have no serious/critical axe violations (WCAG 2.1 A/AA rules).
 * Signed-out, read-only — safe against any database. Run: `pnpm test:e2e e2e/a11y.spec.ts`.
 */
const PAGES = ["/en", "/ja", "/en/challenges", "/en/grants", ...(existsSync("app/[locale]/events/page.tsx") ? ["/en/events"] : [])];

for (const path of PAGES) {
  test(`a11y: ${path} has no serious/critical violations`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} HTTP status`).toBeLessThan(400);
    await page.waitForLoadState("networkidle").catch(() => {}); // long-polling widgets may never idle
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const report = blocking.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}×) e.g. ${v.nodes[0]?.target.join(" ")}`).join("\n");
    expect(blocking, `axe violations on ${path}:\n${report}`).toEqual([]);
  });
}
