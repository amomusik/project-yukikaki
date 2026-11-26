#!/usr/bin/env node
// Rendered Impeccable design check against a running site (default: production).
//
//   pnpm design:check:live                        # https://project-yukikaki.vercel.app
//   DESIGN_URL=http://127.0.0.1:3100 pnpm design:check:live
//   DESIGN_PAGES="/en,/ja/events" DESIGN_VIEWPORT=390x844 pnpm design:check:live
//
// Why not `impeccable detect <url>`: plain URL scans wait for network idle, and Clerk's bot-protection
// probes never settle, so every page times out. Instead we load each page in Playwright's Chromium,
// expose it on a local DevTools port, and run `impeccable detect --cdp` against the page as rendered.
// Reports land in docs/design/live/ (gitignored). Findings never fail the command; use --strict to exit 1.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = (process.env.DESIGN_URL || "https://project-yukikaki.vercel.app").replace(/\/$/, "");
const pages = (process.env.DESIGN_PAGES || "/en,/ja,/en/events,/en/challenges,/en/grants,/en/sign-in").split(",").map((p) => p.trim()).filter(Boolean);
const [width, height] = (process.env.DESIGN_VIEWPORT || "1440x900").split("x").map(Number);
const scheme = process.env.DESIGN_SCHEME === "dark" ? "dark" : "light";
const strict = process.argv.includes("--strict");
const port = Number(process.env.DESIGN_CDP_PORT || 9333);
const launcher = join(process.cwd(), ".github/skills/impeccable/scripts/impeccable");
const bin = process.env.IMPECCABLE_BIN || (existsSync(launcher) ? launcher : "impeccable");
const outDir = join(process.cwd(), "docs/design/live");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1"] });
const page = await (await browser.newContext({ viewport: { width, height }, colorScheme: scheme })).newPage();
let total = 0;
const summary = [];
for (const path of pages) {
  const url = base + path;
  let loaded = false;
  for (let attempt = 1; attempt <= 2 && !loaded; attempt++) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 90_000 });
      await page.waitForTimeout(2500);
      loaded = true;
    } catch (e) {
      console.warn(`retry ${url}: ${String(e).split("\n")[0]}`);
    }
  }
  if (!loaded) {
    summary.push({ url, error: "did not load" });
    continue;
  }
  let raw = "[]";
  try {
    raw = execFileSync(bin, ["detect", "--cdp", String(port), "--target", page.url(), "--json"], { encoding: "utf8", timeout: 120_000 });
  } catch (e) {
    raw = e.stdout || "[]"; // detect exits 1 when it finds anti-patterns
  }
  const findings = JSON.parse(raw || "[]");
  const failing = findings.filter((f) => f.severity !== "advisory");
  total += failing.length;
  const slug = path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
  writeFileSync(join(outDir, `${slug}-${scheme}-${width}x${height}.json`), JSON.stringify(findings, null, 2));
  summary.push({ url: page.url(), findings: failing.length, advisory: findings.length - failing.length });
  console.log(`${page.url()}  ${failing.length} findings, ${findings.length - failing.length} advisory`);
  for (const f of failing) console.log(`  [${f.antipattern}] ${f.snippet ?? ""}`.slice(0, 200));
}
await browser.close();
writeFileSync(join(outDir, "summary.json"), JSON.stringify({ base, viewport: `${width}x${height}`, scheme, summary }, null, 2));
console.log(`\n${total} findings across ${pages.length} pages. Reports: docs/design/live/`);
process.exit(strict && total > 0 ? 1 : 0);
