/**
 * `pnpm audit:orphans` — static orphan audit (dead code, unused exports/deps, i18n keys, env vars,
 * DB columns/enum values, state-machine transitions, React state/effects, API routes/server
 * actions, query params). Read-only: it never edits source. Writes
 *   docs/audit/orphans-<YYYY-MM-DD>.md   (human report)
 *   docs/audit/orphans-<YYYY-MM-DD>.json (machine-readable findings)
 *
 * Flags: --json (print JSON to stdout), --strict (exit 1 when any "bug" finding exists),
 *        --no-knip / --no-tsc / --no-drizzle (skip the slow external tools), --out=<dir>.
 * Never prints .env.local values — only variable names are read.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getTableConfig, type PgEnum, type PgTable } from "drizzle-orm/pg-core";
import * as dbSchema from "@/lib/db/schema";
import { BRIEF_TRANSITIONS, TEAM_TRANSITIONS } from "@/lib/workflow/status";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const outDir = argv.find((a) => a.startsWith("--out="))?.split("=")[1] ?? "docs/audit";

export type Severity = "bug" | "dead code" | "cosmetic";
export type Finding = {
  category: string;
  severity: Severity;
  where: string; // file:line (or file)
  what: string;
  fix: string;
  owner?: "audit-agent" | "other-agent"; // other-agent = file owned by a concurrent agent → report only
};
const findings: Finding[] = [];
const notes: Record<string, string[]> = {};
const note = (cat: string, line: string) => (notes[cat] ??= []).push(line);

/** Files owned by concurrently-working agents: report, never fix. */
const OTHER_OWNED = [
  /^app\/\[locale\]\/page\.tsx$/,
  /^components\/landing\//,
  /^app\/\[locale\]\/events\//,
  /^app\/api\/events\//,
  /^lib\/events\//,
  /^components\/header\.tsx$/,
  /^app\/globals\.css$/,
  /^playwright\.config\.ts$/,
  /^e2e\/flow\.spec\.ts$/,
  /^public\/images\//,
  /^messages\/.*#(landing|events)\./,
];
const ownerOf = (where: string): Finding["owner"] => (OTHER_OWNED.some((r) => r.test(where)) ? "other-agent" : "audit-agent");
function add(f: Omit<Finding, "owner">) {
  findings.push({ ...f, owner: ownerOf(f.where) });
}

/* ── File helpers ─────────────────────────────────────────────────── */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report", "coverage", ".data", "drizzle"]);
function walk(dir: string, exts: string[], out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(path.relative(ROOT, p));
  }
  return out;
}
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const CODE_EXT = [".ts", ".tsx", ".mts", ".mjs"];
const APP_DIRS = ["app", "components", "lib", "i18n", "emails"];
const appFiles = [...APP_DIRS.flatMap((d) => walk(d, CODE_EXT)), ...["middleware.ts", "next.config.ts"].filter((f) => existsSync(f))];
const scriptFiles = walk("scripts", CODE_EXT);
const testFiles = [...walk("tests", CODE_EXT), ...walk("e2e", CODE_EXT)];
const evalFiles = walk("evals", CODE_EXT);
const allCode = [...appFiles, ...scriptFiles, ...testFiles, ...evalFiles];
const src = new Map(allCode.map((f) => [f, read(f)]));
const lineOf = (text: string, idx: number) => text.slice(0, idx).split("\n").length;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ── 1. knip + tsc noUnused ───────────────────────────────────────── */
type KnipItem = { name: string; line?: number; col?: number };
type KnipIssue = { file: string } & Record<string, KnipItem[] | string>;

function auditKnip() {
  if (flag("--no-knip")) return note("knip", "skipped (--no-knip)");
  const r = spawnSync("pnpm", ["-s", "knip", "--reporter", "json", "--no-progress", "--no-exit-code"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let issues: KnipIssue[] = [];
  try {
    issues = (JSON.parse(r.stdout) as { issues: KnipIssue[] }).issues;
  } catch {
    return note("knip", `knip did not return JSON (exit ${r.status}): ${(r.stderr || r.stdout).slice(0, 300)}`);
  }
  for (const is of issues) {
    const list = (k: string) => (Array.isArray(is[k]) ? (is[k] as KnipItem[]) : []);
    for (const f of list("files"))
      add({ category: "knip: unused file", severity: "dead code", where: f.name, what: "File is not imported by any entry point.", fix: "Delete it, or import/render it where intended." });
    for (const k of ["dependencies", "devDependencies"] as const)
      for (const d of list(k))
        add({ category: `knip: unused ${k}`, severity: "cosmetic", where: `${is.file}:${d.line ?? 1}`, what: `${d.name} is never imported.`, fix: `pnpm remove ${d.name} (verify it is not loaded implicitly).` });
    for (const k of ["unlisted", "unresolved", "binaries"])
      for (const d of list(k))
        add({ category: `knip: ${k}`, severity: "bug", where: `${is.file}:${d.line ?? 1}`, what: `${k} reference: ${d.name}`, fix: k === "unlisted" ? `Add ${d.name} to package.json.` : "Fix the import path." });
    for (const k of ["exports", "types", "enumMembers", "duplicates"]) {
      for (const e of list(k)) {
        const text = src.get(is.file) ?? "";
        // Used inside its own file (only the `export` keyword is superfluous) vs entirely dead.
        const uses = (text.match(new RegExp(`\\b${esc(e.name)}\\b`, "g")) ?? []).length;
        const internal = uses > 1;
        add({
          category: `knip: unused ${k === "types" ? "exported type" : k === "exports" ? "export" : k}`,
          severity: internal ? "cosmetic" : "dead code",
          where: `${is.file}:${e.line ?? 1}`,
          what: internal ? `\`${e.name}\` is exported but only used inside its own file.` : `\`${e.name}\` is exported and never referenced anywhere.`,
          fix: internal ? "Drop the `export` keyword (or add a test that needs it)." : "Delete it (or wire it up if it was meant to be used).",
        });
      }
    }
  }
}

function auditTscUnused() {
  if (flag("--no-tsc")) return note("tsc", "skipped (--no-tsc)");
  const r = spawnSync("pnpm", ["-s", "tsc", "-p", "tsconfig.audit.json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const lines = (r.stdout + r.stderr).split("\n").filter((l) => /error TS(6133|6196|6192|6198|6199|6138|6205)/.test(l));
  for (const l of lines) {
    const m = l.match(/^(.+?)\((\d+),\d+\): error TS\d+: (.*)$/);
    if (m) add({ category: "tsc: unused local/param", severity: "cosmetic", where: `${m[1]}:${m[2]}`, what: m[3], fix: "Remove it, or prefix with _ if it is a required positional parameter." });
  }
  note("tsc", `tsc -p tsconfig.audit.json (noUnusedLocals + noUnusedParameters): ${lines.length} unused-symbol errors, exit ${r.status}`);
}

/* ── 2. i18n ──────────────────────────────────────────────────────── */
function flatten(obj: unknown, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out.set(prefix, String(obj));
  return out;
}

export type I18nUsage = { static: Map<string, string[]>; dynamic: { prefix: string; where: string; expr: string }[] };

/** Resolve `t("key")` calls to fully-qualified keys using each file's useTranslations/getTranslations bindings. */
export function collectI18nUsage(files: Map<string, string>): I18nUsage {
  const usage: I18nUsage = { static: new Map(), dynamic: [] };
  const bindRe = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([^"]*)"|'([^']*)'|\{[^}]*namespace:\s*["']([^"']+)["'][^}]*\}|)\s*\)/g;
  for (const [file, text] of files) {
    if (!/useTranslations|getTranslations/.test(text)) continue;
    // Each binding is scoped (approximately) to the calls after it, until the next binding of the same name.
    const bindings = [...text.matchAll(bindRe)].map((m) => ({ v: m[1], ns: m[2] ?? m[3] ?? m[4] ?? "", idx: m.index! }));
    const nsAt = (v: string, idx: number) => {
      const prior = bindings.filter((b) => b.v === v && b.idx < idx).at(-1);
      return prior ? [prior.ns] : [...new Set(bindings.filter((b) => b.v === v).map((b) => b.ns))];
    };
    for (const v of new Set(bindings.map((b) => b.v))) {
      const callRe = new RegExp(`(?<![\\w.])${esc(v)}(?:\\.(?:rich|markup|raw|has))?\\(\\s*(?:"([^"]+)"|'([^']+)'|\`([^\`]*)\`|([^)\\s,][^,)]*))`, "g");
      for (const m of text.matchAll(callRe)) {
        const where = `${file}:${lineOf(text, m.index!)}`;
        for (const ns of nsAt(v, m.index!)) {
          const q = (k: string) => (ns ? `${ns}.${k}` : k);
          if (m[1] ?? m[2]) {
            const key = q((m[1] ?? m[2])!);
            (usage.static.get(key) ?? usage.static.set(key, []).get(key)!).push(where);
          } else if (m[3] !== undefined) {
            if (!m[3].includes("${")) {
              const key = q(m[3]);
              (usage.static.get(key) ?? usage.static.set(key, []).get(key)!).push(where);
            } else usage.dynamic.push({ prefix: q(m[3].slice(0, m[3].indexOf("${"))), where, expr: `\`${m[3]}\`` });
          } else if (m[4]) usage.dynamic.push({ prefix: q(""), where, expr: m[4].trim() });
        }
      }
    }
  }
  return usage;
}

function auditI18n() {
  const locales = readdirSync("messages").filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  const keys = new Map(locales.map((l) => [l, flatten(JSON.parse(read(`messages/${l}.json`)))]));
  const union = new Set([...keys.values()].flatMap((m) => [...m.keys()]));
  const appOnly = new Map([...src].filter(([f]) => appFiles.includes(f)));
  const usage = collectI18nUsage(appOnly);
  const msgWhere = (l: string, k: string) => {
    const text = read(`messages/${l}.json`);
    const leaf = k.split(".").pop()!;
    const i = text.indexOf(`"${leaf}"`);
    return `messages/${l}.json:${i >= 0 ? lineOf(text, i) : 1}#${k}`;
  };
  // A key is "used" when referenced statically, via a used parent (t.raw / t.has on an object), or covered by a dynamic prefix.
  const isUsed = (k: string) =>
    usage.static.has(k) ||
    [...usage.static.keys()].some((u) => k.startsWith(`${u}.`)) ||
    usage.dynamic.some((d) => d.prefix && k.startsWith(d.prefix));
  const allText = [...appOnly.values()].join("\n");
  let unused = 0;
  for (const k of [...union].sort()) {
    if (isUsed(k)) continue;
    unused++;
    const leaf = k.split(".").pop()!;
    const literalSeen = new RegExp(`["'\`]${esc(leaf)}["'\`]`).test(allText);
    add({
      category: "i18n: unused key",
      severity: "dead code",
      where: msgWhere(locales[0], k),
      what: `\`${k}\` is never referenced by t()/getTranslations.${literalSeen ? ` (The leaf "${leaf}" appears as a string literal — possibly an indirect key; verify.)` : ""}`,
      fix: literalSeen ? "Verify the indirect lookup; delete if unused." : "Delete the key from every locale.",
    });
  }
  for (const [k, wheres] of usage.static) {
    for (const l of locales) {
      const m = keys.get(l)!;
      const present = m.has(k) || [...m.keys()].some((x) => x.startsWith(`${k}.`));
      if (!present) {
        // t.has("x") guarded lookups are allowed to miss.
        const guarded = wheres.every((w) => {
          const [f, ln] = w.split(":");
          return /\.has\(/.test((src.get(f) ?? "").split("\n")[Number(ln) - 1] ?? "");
        });
        if (!guarded) add({ category: "i18n: missing key", severity: "bug", where: wheres[0], what: `\`${k}\` is used in code but missing from messages/${l}.json (renders the raw key).`, fix: `Add \`${k}\` to messages/${l}.json.` });
      }
    }
  }
  for (const k of union) {
    const missing = locales.filter((l) => !keys.get(l)!.has(k));
    if (missing.length) {
      const present = locales.find((l) => keys.get(l)!.has(k))!;
      add({ category: "i18n: locale mismatch", severity: "bug", where: msgWhere(present, k), what: `\`${k}\` exists in ${present} but not in ${missing.join(", ")}.`, fix: `Translate and add it to ${missing.join(", ")}.` });
    }
  }
  const seen = new Set<string>();
  for (const d of usage.dynamic) {
    const id = `${d.where}|${d.expr}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const covered = [...union].filter((k) => d.prefix && k.startsWith(d.prefix)).length;
    add({ category: "i18n: dynamic key (verify manually)", severity: "cosmetic", where: d.where, what: `Dynamic key ${d.expr} → prefix \`${d.prefix || "(namespace root)"}\` covers ${covered} keys.`, fix: "Verify every runtime value has a key in en and ja (or guard with t.has)." });
  }
  note("i18n", `${locales.join("/")}: ${union.size} keys; ${usage.static.size} static references, ${usage.dynamic.length} dynamic references; ${unused} unused.`);
}

/* ── 3. Env vars ──────────────────────────────────────────────────── */
function envNames(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  // Names only — values are never read into memory beyond this split.
  return new Set(readFileSync(file, "utf8").split("\n").map((l) => l.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1]).filter((x): x is string => Boolean(x)));
}
/** Read implicitly by a library or provided by the platform — not referenced in our code by design. */
const IMPLICIT_ENV: Record<string, string> = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "read by @clerk/nextjs",
  CLERK_SECRET_KEY: "read by @clerk/nextjs",
  VERCEL: "set by the Vercel platform",
  CI: "set by CI",
  NODE_ENV: "set by Next.js",
  TMPDIR: "set by the OS",
};

function auditEnv() {
  const used = new Map<string, string[]>();
  const push = (k: string, w: string) => (used.get(k) ?? used.set(k, []).get(k)!).push(w);
  for (const [f, text] of src) {
    if (f.startsWith("evals/")) continue;
    for (const m of text.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\])/g)) push((m[1] ?? m[2])!, `${f}:${lineOf(text, m.index!)}`);
    if (/from\s+["']@\/lib\/env["']/.test(text) || f === "lib/env.ts")
      for (const m of text.matchAll(/(?<![\w.])env\.([A-Z][A-Z0-9_]*)/g)) push(m[1], `${f}:${lineOf(text, m.index!)}`);
  }
  const envTs = read("lib/env.ts");
  const schemaKeys = new Set([...envTs.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]));
  const example = envNames(".env.example");
  const local = envNames(".env.local");
  const exText = read(".env.example");
  const exLine = (k: string) => {
    const i = exText.search(new RegExp(`^${k}=`, "m"));
    return `.env.example:${i >= 0 ? lineOf(exText, i) : 1}`;
  };
  for (const k of [...example].sort()) {
    if (used.has(k)) continue;
    if (IMPLICIT_ENV[k]) {
      note("env", `${k}: declared, not referenced in code — ${IMPLICIT_ENV[k]} (OK)`);
      continue;
    }
    add({ category: "env: declared but unused", severity: "dead code", where: exLine(k), what: `${k} is in .env.example${schemaKeys.has(k) ? " and lib/env.ts" : ""} but never read.`, fix: "Remove it, or read it where intended." });
  }
  for (const k of [...schemaKeys].sort())
    if (!used.has(k))
      add({ category: "env: in lib/env.ts schema but unused", severity: "dead code", where: `lib/env.ts:${lineOf(envTs, envTs.indexOf(`  ${k}:`))}`, what: `${k} is validated but never read.`, fix: "Remove from the schema." });
  for (const [k, wheres] of [...used].sort()) {
    if (example.has(k) || IMPLICIT_ENV[k]) continue;
    const testOnly = wheres.every((w) => /^(tests|e2e)\//.test(w));
    const tooling = wheres.every((w) => /^(tests|e2e|scripts|playwright)/.test(w));
    add({
      category: "env: used but undeclared",
      severity: testOnly || tooling || schemaKeys.has(k) ? "cosmetic" : "bug",
      where: wheres[0],
      what: `${k} is read (${wheres.length}×) but not documented in .env.example${schemaKeys.has(k) ? "" : " nor validated in lib/env.ts"}.${testOnly ? " Test-only." : tooling ? " Tooling-only." : ""}`,
      fix: testOnly ? "Document in tests/README or e2e config comments." : `Add ${k}= with a comment to .env.example.`,
    });
  }
  for (const k of [...local].sort())
    if (!example.has(k) && !IMPLICIT_ENV[k])
      add({ category: "env: in .env.local only", severity: "cosmetic", where: ".env.local (name only)", what: `${k} is set locally but not declared in .env.example${used.has(k) ? "" : " and never read"}.`, fix: used.has(k) ? "Declare it in .env.example." : "Remove it from .env.local." });
  for (const k of [...example].sort()) if (!local.has(k)) note("env", `${k}: declared but not set in .env.local`);
  note("env", `${used.size} vars read in code; ${example.size} in .env.example; ${local.size} names in .env.local; ${schemaKeys.size} in lib/env.ts.`);
}

/* ── 4. DB schema ─────────────────────────────────────────────────── */
function auditDb() {
  const schemaText = read("lib/db/schema.ts");
  const code = [...src].filter(([f]) => f !== "lib/db/schema.ts" && !f.startsWith("evals/"));
  const prodCode = code.filter(([f]) => !/^(tests|e2e)\//.test(f));
  const seedText = existsSync("seed/seed.json") ? read("seed/seed.json") : "";
  const tables = Object.entries(dbSchema).filter(([, v]) => v && typeof v === "object" && Symbol.for("drizzle:IsDrizzleTable") in (v as object)) as [string, PgTable][];
  for (const [tableKey, table] of tables) {
    const cfg = getTableConfig(table);
    const tableRe = new RegExp(`schema\\.${tableKey}\\b|\\b${tableKey}\\b`);
    const tableUsed = prodCode.some(([, t]) => tableRe.test(t) && /schema|from\s+["']@\/lib\/db/.test(t));
    if (!tableUsed) add({ category: "db: unused table", severity: "dead code", where: `lib/db/schema.ts:${lineOf(schemaText, schemaText.indexOf(`export const ${tableKey} =`))}`, what: `Table ${cfg.name} is never queried in app code.`, fix: "Drop it in a migration or wire it up." });
    // Column property names on this table.
    const props = Object.entries(table as unknown as Record<string, { name?: string }>).filter(([, c]) => c && typeof c === "object" && "columnType" in c);
    for (const [prop, col] of props) {
      if (["id", "createdAt", "updatedAt"].includes(prop)) continue;
      const snake = col.name!;
      const readRe = new RegExp(`\\.${prop}\\b|\\b${snake}\\b|\\{[^}]*\\b${prop}\\b[^}]*\\}\\s*=`);
      const writeRe = new RegExp(`\\b${prop}\\s*:|\\b${snake}\\b|\\b${prop}\\s*[,}]`);
      const reads = prodCode.filter(([, t]) => readRe.test(t)).map(([f]) => f);
      const writes = prodCode.filter(([, t]) => writeRe.test(t)).map(([f]) => f);
      const testRefs = code.filter(([f, t]) => /^(tests|e2e)\//.test(f) && new RegExp(`\\b${prop}\\b`).test(t)).length;
      const where = `lib/db/schema.ts:${lineOf(schemaText, schemaText.search(new RegExp(`\\b${prop}:\\s*\\w+\\(\\s*"${snake}"`)))}`;
      if (!reads.length && !writes.length)
        add({ category: "db: unused column", severity: "dead code", where, what: `${cfg.name}.${snake} is never read or written in app code${testRefs ? " (tests only)" : ""}.`, fix: "Drop it in a migration, or start using it." });
      else if (!reads.length)
        add({ category: "db: write-only column", severity: "dead code", where, what: `${cfg.name}.${snake} is written (${writes.join(", ")}) but never read back.`, fix: "Display/use it, or stop writing and drop it." });
      else if (!writes.length && !col.name!.endsWith("_at"))
        add({ category: "db: never-written column", severity: "cosmetic", where, what: `${cfg.name}.${snake} is read but never written by app code (only defaults/seed${seedText.includes(prop) ? ", present in seed.json" : ""}).`, fix: "Confirm the default is intended; otherwise add the writer or drop the column." });
    }
  }
  // Enum values: a literal of the value must appear in production code (or seed) somewhere.
  const enums = Object.entries(dbSchema).filter(([, v]) => typeof v === "function" && "enumValues" in (v as object)) as unknown as [string, PgEnum<[string, ...string[]]>][];
  for (const [name, e] of enums) {
    for (const v of e.enumValues) {
      const lit = new RegExp(`["'\`]${esc(v)}["'\`]`);
      const inCode = prodCode.filter(([, t]) => lit.test(t)).map(([f]) => f);
      const inSeed = new RegExp(`"${esc(v)}"`).test(seedText);
      if (!inCode.length) {
        const i = schemaText.indexOf(`"${v}"`, schemaText.indexOf(`${name} = pgEnum`));
        add({ category: "db: enum value never referenced", severity: inSeed ? "cosmetic" : "dead code", where: `lib/db/schema.ts:${lineOf(schemaText, i)}`, what: `${e.enumName}.${v} never appears in app code${inSeed ? " (only in seed/seed.json)" : " nor seed"}.`, fix: "Remove the value (migration) or add the code path that sets it." });
      }
    }
  }
  // Migrations vs schema: generate into a scratch copy and see whether drizzle-kit wants a new migration.
  if (flag("--no-drizzle")) return note("db", "drizzle drift check skipped (--no-drizzle)");
  const check = spawnSync("pnpm", ["-s", "drizzle-kit", "check"], { encoding: "utf8" });
  note("db", `drizzle-kit check: exit ${check.status} — ${(check.stdout + check.stderr).trim().split("\n").pop()}`);
  const tmp = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), "yk-drizzle-"));
  try {
    cpSync("drizzle", path.join(tmp, "drizzle"), { recursive: true });
    const cfg = path.join(tmp, "drizzle.config.mjs");
    writeFileSync(cfg, `export default { schema: ${JSON.stringify(path.join(ROOT, "lib/db/schema.ts"))}, out: ${JSON.stringify(path.join(tmp, "drizzle"))}, dialect: "postgresql" };\n`);
    const before = readdirSync(path.join(tmp, "drizzle")).filter((f) => f.endsWith(".sql")).length;
    const gen = spawnSync("pnpm", ["-s", "drizzle-kit", "generate", `--config=${cfg}`], { encoding: "utf8" });
    const after = readdirSync(path.join(tmp, "drizzle")).filter((f) => f.endsWith(".sql"));
    if (after.length > before) {
      const sql = readFileSync(path.join(tmp, "drizzle", after.sort().at(-1)!), "utf8");
      add({ category: "db: schema/migration drift", severity: "bug", where: "drizzle/", what: `lib/db/schema.ts has changes with no migration:\n${sql.slice(0, 600)}`, fix: "Run `pnpm db:generate` and commit the migration." });
    } else note("db", `drizzle-kit generate (scratch copy): no pending changes — migrations match schema. ${(gen.stdout + gen.stderr).trim().split("\n").pop() ?? ""}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/* ── 5. State machines ────────────────────────────────────────────── */
type Site = { entity: string; from: string | null; to: string; where: string; fn: string | null };
function enclosingFn(text: string, idx: number): string | null {
  const before = text.slice(0, idx);
  const all = [...before.matchAll(/export\s+(?:async\s+)?function\s+(\w+)|(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/g)];
  const last = all.at(-1);
  return last ? (last[1] ?? last[2] ?? last[3]) : null;
}
function resolveTo(text: string, idx: number, expr: string): string[] {
  const lit = expr.match(/^["']([a-z_]+)["']$/);
  if (lit) return [lit[1]];
  const window = text.slice(Math.max(0, idx - 800), idx);
  const decl = [...window.matchAll(new RegExp(`const\\s+${esc(expr)}\\s*=\\s*([^;\\n]+)`, "g"))].at(-1);
  return decl ? [...decl[1].matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]).filter((v) => v !== "approve" && v !== "reject") : [];
}

export function collectTransitionSites(files: Map<string, string>, unusedFns: Set<string>): Site[] {
  const sites: Site[] = [];
  for (const [f, text] of files) {
    if (/^(tests|e2e|evals)\//.test(f) || f === "lib/workflow/status.ts") continue;
    for (const m of text.matchAll(/setBriefStatus\(\s*[^,]+,\s*([^,]+),\s*([^)]+)\)/g))
      for (const to of resolveTo(text, m.index!, m[2].trim())) {
        const from = m[1].trim().match(/^["']([a-z_]+)["']$/)?.[1] ?? null;
        sites.push({ entity: "brief", from, to, where: `${f}:${lineOf(text, m.index!)}`, fn: enclosingFn(text, m.index!) });
      }
    for (const m of text.matchAll(/update\(schema\.(teams|briefs|eventRsvps|events)\)\s*\.set\(\{\s*status:\s*([^,}]+)/g)) {
      const entity = { teams: "team", briefs: "brief", eventRsvps: "rsvp", events: "event" }[m[1]]!;
      const window = text.slice(Math.max(0, m.index! - 400), m.index!);
      const assert = [...window.matchAll(/assertTransition\(\s*["'](\w+)["'],\s*([^,]+),\s*([^)]+)\)/g)].at(-1);
      const tos = resolveTo(text, m.index!, m[2].trim());
      const fromLit = assert?.[2].trim().match(/^["']([a-z_]+)["']$/)?.[1] ?? null;
      for (const to of tos.length ? tos : ["(variable)"]) sites.push({ entity, from: fromLit, to, where: `${f}:${lineOf(text, m.index!)}`, fn: enclosingFn(text, m.index!) });
    }
    for (const m of text.matchAll(/insert\(schema\.(teams|briefs|eventRsvps|events)\)[\s\S]{0,300}?status:\s*["']([a-z_]+)["']/g)) {
      const entity = { teams: "team", briefs: "brief", eventRsvps: "rsvp", events: "event" }[m[1]]!;
      sites.push({ entity, from: null, to: m[2], where: `${f}:${lineOf(text, m.index!)}`, fn: enclosingFn(text, m.index!) });
    }
    // values({ ..., status }) shorthand: resolve the variable's literals (e.g. `cond ? "going" : "waitlist"`).
    for (const m of text.matchAll(/insert\(schema\.(teams|briefs|eventRsvps|events)\)\s*\.values\(\{[^}]*\bstatus\s*[,}]/g)) {
      const entity = { teams: "team", briefs: "brief", eventRsvps: "rsvp", events: "event" }[m[1]]!;
      for (const to of resolveTo(text, m.index!, "status")) sites.push({ entity, from: null, to, where: `${f}:${lineOf(text, m.index!)}`, fn: enclosingFn(text, m.index!) });
    }
  }
  return sites.map((s) => ({ ...s, fn: s.fn && unusedFns.has(s.fn) ? `${s.fn} (UNREACHABLE: no callers)` : s.fn }));
}

function auditStateMachines() {
  // A setter is "unreachable" when its enclosing exported function has no caller in production code
  // (tests don't count: a tested-but-unwired function still can't happen for real users).
  const prod = [...src].filter(([f]) => !/^(tests|e2e|evals)\//.test(f) && f !== "scripts/audit-orphans.ts");
  const draft = collectTransitionSites(src, new Set());
  const unusedFns = new Set(
    draft
      .map((x) => ({ fn: x.fn, file: x.where.split(":")[0] }))
      .filter(({ fn, file }) => fn && !prod.some(([f, t]) => (f === file ? (t.match(new RegExp(`\\b${fn}\\b`, "g")) ?? []).length > 1 : new RegExp(`\\b${fn}\\b`).test(t))))
      .map(({ fn }) => fn!),
  );
  const sites = collectTransitionSites(src, unusedFns);
  const machines: [string, Record<string, string[]>, string][] = [
    ["brief", BRIEF_TRANSITIONS, "draft"],
    ["team", TEAM_TRANSITIONS, "pending"],
  ];
  const statusText = read("lib/workflow/status.ts");
  for (const [entity, table, initial] of machines) {
    const states = Object.keys(table);
    const rows: string[] = [];
    for (const s of states) {
      const incoming = states.filter((x) => table[x].includes(s));
      const setters = sites.filter((x) => x.entity === entity && x.to === s);
      rows.push(`| ${s} | ${incoming.join(", ") || "—"} | ${table[s].join(", ") || "— (terminal)"} | ${setters.map((x) => `${x.where} (${x.fn ?? "?"}${x.from ? `, from ${x.from}` : ""})`).join("<br>") || (s === initial ? "(column default on insert)" : "**none**")} |`);
      if (!incoming.length && s !== initial)
        add({ category: "state machine: unreachable state", severity: "bug", where: `lib/workflow/status.ts:${lineOf(statusText, statusText.indexOf(`  ${s}:`))}`, what: `${entity} state "${s}" has no incoming transition.`, fix: "Add a transition into it or remove it." });
      const liveSetters = setters.filter((x) => !x.fn?.includes("UNREACHABLE"));
      if (s !== initial && !liveSetters.length)
        add({ category: "state machine: state never set", severity: setters.length ? "bug" : "dead code", where: `lib/workflow/status.ts:${lineOf(statusText, statusText.indexOf(`  ${s}:`))}`, what: `No reachable code path sets ${entity} → "${s}"${setters.length ? ` (only ${setters.map((x) => x.fn).join(", ")})` : ""}. Only seed data can produce it.`, fix: "Wire the setter into the UI/API, or drop the state." });
    }
    const invoked = (from: string, to: string) => sites.some((x) => x.entity === entity && x.to === to && (x.from === from || x.from === null) && !x.fn?.includes("UNREACHABLE"));
    for (const from of states)
      for (const to of table[from]) {
        // If NO outgoing edge of `from` is ever taken, the state is a dead end for real users → bug.
        const deadEnd = table[from].every((t) => !invoked(from, t));
        if (!invoked(from, to))
          add({ category: "state machine: transition never invoked", severity: deadEnd ? "bug" : "dead code", where: `lib/workflow/status.ts:${lineOf(statusText, statusText.indexOf(`  ${from}:`))}`, what: `${entity} transition ${from} → ${to} is legal but no reachable code path performs it${deadEnd ? ` — "${from}" is therefore a dead end in practice` : ""}${sites.some((x) => x.entity === entity && x.to === to && x.fn?.includes("UNREACHABLE")) ? " (the only caller is unreachable)" : ""}.`, fix: from === "rejected" ? "Expose resubmitBrief() (e.g. an admin 'Resubmit' action) or drop the edge." : "Wire it up or remove the edge." });
      }
    note("state machines", `### ${entity}\n| state | incoming (defined) | outgoing (defined) | code paths that set it |\n|---|---|---|---|\n${rows.join("\n")}`);
  }
  for (const entity of ["rsvp", "event"]) {
    const s = sites.filter((x) => x.entity === entity);
    if (!s.length) continue;
    const e = entity === "rsvp" ? dbSchema.rsvpStatusEnum : dbSchema.eventStatusEnum;
    const rows = e.enumValues.map((v) => `| ${v} | ${s.filter((x) => x.to === v || x.to === "(variable)").map((x) => `${x.where}${x.to === "(variable)" ? " (variable)" : ""} (${x.fn})`).join("<br>") || "(default only)"} |`);
    note("state machines", `### ${entity} (report only — lib/events is owned by another agent; no transition table exists)\n| status | code paths that set it |\n|---|---|\n${rows.join("\n")}`);
    if (!src.has("lib/workflow/status.ts") || !/rsvp/i.test(read("lib/workflow/status.ts")))
      add({ category: "state machine: no transition table", severity: "cosmetic", where: "lib/events/store.ts", what: `${entity} status changes are not validated by lib/workflow/status.ts (any → any is possible).`, fix: `Add ${entity.toUpperCase()}_TRANSITIONS and assertTransition() calls.` });
  }
}

/* ── 6. React state / effects ─────────────────────────────────────── */
export function extractBlock(text: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === "{" || text[i] === "(") depth++;
    else if (text[i] === "}" || text[i] === ")") {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
  }
  return text.slice(openIdx);
}

export function reactFindings(file: string, text: string): Omit<Finding, "owner">[] {
  const out: Omit<Finding, "owner">[] = [];
  for (const m of text.matchAll(/const\s+\[\s*(\w+)?\s*(?:,\s*(\w+)?\s*)?\]\s*=\s*(?:React\.)?useState\b/g)) {
    const [, value, setter] = m;
    const ln = lineOf(text, m.index!);
    const count = (id: string) => (text.match(new RegExp(`\\b${esc(id)}\\b`, "g")) ?? []).length;
    if (value && count(value) === 1) out.push({ category: "react: state never read", severity: "dead code", where: `${file}:${ln}`, what: `State \`${value}\` is set but never read.`, fix: "Remove the state (or render it)." });
    if (value && (!setter || count(setter) === 1)) out.push({ category: "react: state never set", severity: "cosmetic", where: `${file}:${ln}`, what: `${setter ? `Setter \`${setter}\` is never called` : "No setter is destructured"} — \`${value}\` is effectively a constant.`, fix: "Replace with a const / useMemo." });
  }
  for (const m of text.matchAll(/use(?:Layout)?Effect\(\s*\(\)\s*=>\s*\{/g)) {
    const body = extractBlock(text, m.index! + m[0].length - 1);
    const needs = body.match(/addEventListener|new\s+(?:IntersectionObserver|ResizeObserver|MutationObserver)|setInterval|setTimeout|requestAnimationFrame|matchMedia\([^)]*\)\.addEventListener|\.subscribe\(/g);
    if (!needs) continue;
    const hasCleanup = /return\s*(?:\(\s*\)\s*=>|function|\w+\s*;|\(\s*\)\s*\{)|return\s+\(\)\s*=>/.test(body);
    if (!hasCleanup) out.push({ category: "react: effect without cleanup", severity: "bug", where: `${file}:${lineOf(text, m.index!)}`, what: `useEffect starts ${[...new Set(needs)].join(", ")} but returns no cleanup (leaks after unmount / double-runs in StrictMode).`, fix: "Return a cleanup that removes listeners, disconnects observers and clears timers." });
    else {
      const missing = [
        /addEventListener/.test(body) && !/removeEventListener/.test(body) ? "removeEventListener" : null,
        /new\s+\w*Observer/.test(body) && !/disconnect\(|unobserve\(/.test(body) ? "disconnect()" : null,
        /setInterval/.test(body) && !/clearInterval/.test(body) ? "clearInterval" : null,

        /setTimeout/.test(body) && !/clearTimeout/.test(body) && !/cancelled|alive|active|mounted/.test(body) ? "clearTimeout" : null,
      ].filter(Boolean);
      const rafOnly = /requestAnimationFrame/.test(body) && !/cancelAnimationFrame/.test(body);
      if (rafOnly && !missing.length) out.push({ category: "react: incomplete effect cleanup", severity: "cosmetic", where: `${file}:${lineOf(text, m.index!)}`, what: "Effect schedules requestAnimationFrame (inside handlers) without cancelAnimationFrame in the cleanup — a frame may setState after unmount.", fix: "Track the rAF id and cancel it in the cleanup." });
      if (missing.length) out.push({ category: "react: incomplete effect cleanup", severity: "bug", where: `${file}:${lineOf(text, m.index!)}`, what: `Effect has a cleanup but never calls ${missing.join(", ")}.`, fix: `Call ${missing.join(", ")} in the cleanup.` });
    }
  }
  return out;
}

function auditReact() {
  let n = 0;
  for (const [f, text] of src) {
    if (!/^(app|components)\//.test(f) || !/useState|useEffect/.test(text)) continue;
    n++;
    for (const x of reactFindings(f, text)) add(x);
  }
  note("react", `${n} files with hooks scanned.`);
}

/* ── 7. API routes & server actions ───────────────────────────────── */
function auditRoutes() {
  const docs = ["README.md", ...walk("docs", [".md"]).filter((f) => !f.startsWith("docs/audit/"))];
  const docText = docs.map((f) => read(f)).join("\n");
  const vercel = existsSync("vercel.json") ? read("vercel.json") : "";
  for (const f of appFiles.filter((x) => /^app\/api\/.+\/route\.ts$/.test(x))) {
    const segs = f.replace(/^app/, "").replace(/\/route\.ts$/, "").split("/");
    const re = new RegExp(segs.map((s) => (s.startsWith("[") ? "[^/\"'`\\s]+" : esc(s))).join("/") + "(?![\\w-])");
    const callers = [...src].filter(([g, t]) => g !== f && re.test(t)).map(([g]) => g);
    const ui = callers.filter((g) => /^(app|components|lib)\//.test(g));
    const tests = callers.filter((g) => /^(tests|e2e)\//.test(g));
    const documented = re.test(docText) || re.test(vercel);
    const methods = [...read(f).matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]).join("/");
    const external = /webhook|refresh|cron/.test(f);
    note("routes", `${segs.join("/")} [${methods}] — UI: ${ui.join(", ") || "none"}; tests: ${tests.join(", ") || "none"}; docs: ${documented ? "yes" : "no"}`);
    if (!ui.length && !tests.length)
      add({ category: "api: route never called", severity: external && documented ? "cosmetic" : "dead code", where: f, what: `${segs.join("/")} [${methods}] has no caller in UI, lib or tests${documented ? " (documented as externally called)" : ""}.`, fix: external ? "Add a route test that exercises the handler." : "Delete the route or call it from the UI; add a test." });
  }
  for (const f of appFiles.filter((x) => /^\s*["']use server["']/.test(src.get(x) ?? ""))) {
    const text = src.get(f)!;
    for (const m of text.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
      const name = m[1];
      const callers = [...src].filter(([g, t]) => g !== f && new RegExp(`\\b${name}\\b`).test(t)).map(([g]) => g);
      if (!callers.length)
        add({ category: "server action never used", severity: "dead code", where: `${f}:${lineOf(text, m.index!)}`, what: `Server action \`${name}\` is not imported by any component or test.`, fix: "Delete it or wire it to a form." });
    }
  }
}

/* ── 8. Query params / flags ──────────────────────────────────────── */
function auditQueryParams() {
  const docs = ["README.md", ...walk("docs", [".md"]).filter((f) => !f.startsWith("docs/audit/"))];
  const documented = new Map<string, string>();
  for (const d of docs) {
    const t = read(d);
    for (const m of t.matchAll(/[?&]([a-z_]+)=([\w-]*)/g)) if (!["sslmode"].includes(m[1])) documented.set(m[1], `${d}:${lineOf(t, m.index!)}`);
  }
  const read_ = new Map<string, string>();
  const produced = new Map<string, string>();
  for (const [f, t] of src) {
    if (!/^(app|components|lib)\//.test(f)) continue;
    if (/searchParams/.test(t)) for (const m of t.matchAll(/\.get\(\s*["'](\w+)["']\s*\)/g)) if (!/headers|cookies|formData|fd\.|\bh\.get|forwarded/.test(t.split("\n")[lineOf(t, m.index!) - 1])) read_.set(m[1], `${f}:${lineOf(t, m.index!)}`);
    for (const m of t.matchAll(/searchParams:\s*Promise<\{([^}]*)\}>/g)) {
      const declared = [...m[1].matchAll(/(\w+)\??:/g)].map((x) => x[1]);
      const ln = lineOf(t, m.index!);
      for (const p of declared) {
        const usedRe = new RegExp(`(?:sp|raw|searchParams\\))\\.${p}\\b|\\{[^}]*\\b${p}\\b[^}]*\\}\\s*=\\s*await\\s+searchParams|\\b(?:sp|raw)\\[["']${p}["']\\]`);
        if (usedRe.test(t) || (/const\s+(sp|raw)\s*=\s*await\s+searchParams/.test(t) && new RegExp(`\\b(sp|raw)\\b[^\\n]*\\b${p}\\b|Object\\.(entries|keys)\\((sp|raw)\\)`).test(t))) read_.set(p, `${f}:${ln}`);
        else add({ category: "query param: declared but never read", severity: "cosmetic", where: `${f}:${ln}`, what: `searchParams type declares \`${p}\` but the page never reads it.`, fix: `Remove \`${p}\` from the type (or handle it).` });
      }
    }
    for (const m of t.matchAll(/[?&]([a-z_]+)=(?:\$\{|[\w-])/g)) {
      const line = t.split("\n")[lineOf(t, m.index!) - 1];
      // Only app-internal links: skip external APIs/URLs, static assets and auth-provider params.
      if (/https?:|fetch\(|\$\{API|\$\{base|\.(webp|png|jpe?g|svg)\?|[Ll]oader/.test(line) || ["redirect_url"].includes(m[1])) continue;
      produced.set(m[1], `${f}:${lineOf(t, m.index!)}`);
    }
    for (const m of t.matchAll(/searchParams\.set\(\s*["'](\w+)["']/g)) produced.set(m[1], `${f}:${lineOf(t, m.index!)}`);
    // GET forms produce their field names as query params; URLSearchParams({ q }) literals too.
    // (Server-action forms — action={fn} — POST FormData, not query params.)
    if (/<form[^>]*(?:method=["']get["']|action=["'`/{][^>]*\/(?:\$\{locale\}|ja|en)\/)/i.test(t) || /<form[^>]*action=["']\//.test(t))
      for (const m of t.matchAll(/\bname=["'](\w+)["']/g)) if (!produced.has(m[1])) produced.set(m[1], `${f}:${lineOf(t, m.index!)}`);
    if (/^(app|components)\//.test(f))
      for (const m of t.matchAll(/new URLSearchParams\(\{([^}]*)\}/g)) for (const part of m[1].split(",")) {
          const k = part.split(":")[0].trim();
          if (/^\w+$/.test(k)) produced.set(k, `${f}:${lineOf(t, m.index!)}`);
        }
  }
  for (const [p, w] of documented)
    if (!read_.has(p)) add({ category: "query param: documented but unused", severity: "bug", where: w, what: `Docs mention ?${p}= but no route reads it.`, fix: "Fix the docs or implement the param." });
  for (const [p, w] of read_)
    if (!documented.has(p) && !produced.has(p)) add({ category: "query param: read but undocumented", severity: "cosmetic", where: w, what: `?${p} is read but never generated by a link nor documented.`, fix: "Document it (README/docs) or remove the handler." });
  for (const [p, w] of produced)
    if (!read_.has(p) && !documented.has(p)) add({ category: "query param: produced but never read", severity: "bug", where: w, what: `A link/redirect sets ?${p}= but nothing reads it.`, fix: "Read it on the target page or stop emitting it." });
  note("query params", `read: ${[...read_.keys()].join(", ")}; produced by links/redirects: ${[...produced.keys()].join(", ")}; documented: ${[...documented.keys()].join(", ")}`);
}

/* ── Report ───────────────────────────────────────────────────────── */
const SEV_ORDER: Record<Severity, number> = { bug: 0, "dead code": 1, cosmetic: 2 };

function render(date: string): string {
  const byCat = new Map<string, Finding[]>();
  for (const f of findings) (byCat.get(f.category) ?? byCat.set(f.category, []).get(f.category)!).push(f);
  const sev = (s: Severity) => findings.filter((f) => f.severity === s).length;
  const lines = [
    `# Orphan audit — ${date}`,
    "",
    "Generated by `pnpm audit:orphans` (scripts/audit-orphans.ts). Static analysis — every finding has a file:line; treat heuristics (React, DB read/write) as leads to verify.",
    "",
    `**${findings.length} findings** — bug: ${sev("bug")}, dead code: ${sev("dead code")}, cosmetic: ${sev("cosmetic")}. Owned by other agents (report-only): ${findings.filter((f) => f.owner === "other-agent").length}.`,
    "",
    "| category | bug | dead code | cosmetic |",
    "|---|---|---|---|",
    ...[...byCat].sort().map(([c, fs]) => `| ${c} | ${fs.filter((f) => f.severity === "bug").length} | ${fs.filter((f) => f.severity === "dead code").length} | ${fs.filter((f) => f.severity === "cosmetic").length} |`),
    "",
  ];
  for (const [cat, ns] of Object.entries(notes)) lines.push(`## Notes: ${cat}`, "", ...ns.map((n) => (n.startsWith("#") || n.startsWith("|") ? n : `- ${n}`)), "");
  lines.push("## Findings", "");
  for (const [cat, fs] of [...byCat].sort((a, b) => Math.min(...a[1].map((f) => SEV_ORDER[f.severity])) - Math.min(...b[1].map((f) => SEV_ORDER[f.severity])) || a[0].localeCompare(b[0]))) {
    lines.push(`### ${cat} (${fs.length})`, "", "| severity | where | finding | suggested fix | owner |", "|---|---|---|---|---|");
    for (const f of fs.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]))
      lines.push(`| ${f.severity} | \`${f.where}\` | ${f.what.replace(/\|/g, "\\|").replace(/\n/g, "<br>")} | ${f.fix.replace(/\|/g, "\\|")} | ${f.owner === "other-agent" ? "other agent (report only)" : "—"} |`);
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const steps: [string, () => void][] = [
    ["knip", auditKnip],
    ["tsc", auditTscUnused],
    ["i18n", auditI18n],
    ["env", auditEnv],
    ["db", auditDb],
    ["state machines", auditStateMachines],
    ["react", auditReact],
    ["routes", auditRoutes],
    ["query params", auditQueryParams],
  ];
  for (const [name, fn] of steps) {
    const t0 = Date.now();
    try {
      fn();
    } catch (e) {
      note(name, `audit step crashed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!flag("--json")) console.error(`· ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  mkdirSync(outDir, { recursive: true });
  const md = path.join(outDir, `orphans-${date}.md`);
  const manual = path.join(outDir, "manual-findings.md");
  writeFileSync(md, render(date) + (existsSync(manual) ? `\n${readFileSync(manual, "utf8")}` : ""));
  writeFileSync(path.join(outDir, `orphans-${date}.json`), JSON.stringify({ date, findings, notes }, null, 2));
  const counts = (["bug", "dead code", "cosmetic"] as Severity[]).map((s) => `${s}: ${findings.filter((f) => f.severity === s).length}`).join(", ");
  if (flag("--json")) console.log(JSON.stringify({ date, findings }, null, 2));
  else console.log(`Orphan audit: ${findings.length} findings (${counts}) → ${md}`);
  if (flag("--strict") && findings.some((f) => f.severity === "bug")) process.exit(1);
}

// Only run when executed directly (tests import the pure helpers).
if (process.argv[1] && /audit-orphans\.ts$/.test(process.argv[1])) main();
