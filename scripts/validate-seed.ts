/**
 * Validates seed/seed.json and seed/prebaked/*.json against their zod schemas
 * and checks referential integrity + brief-status consistency.
 *
 *   npx tsx scripts/validate-seed.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { seedSchema } from "@/lib/seed-schema";
import { prebakedSchema, prebakedSourceIsOfficial, type Prebaked } from "@/lib/grounding/prebaked";
import { findCity } from "@/lib/grounding/city-profiles";
import { findIndustry } from "@/lib/grounding/industry-neighbors";

const root = process.cwd();
const seedPath = path.join(root, "seed", "seed.json");
const prebakedDir = path.join(root, "seed", "prebaked");
const errors: string[] = [];
const err = (m: string) => errors.push(m);

function fail(): never {
  console.error(`✗ seed invalid (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (!existsSync(seedPath)) {
  err(`missing ${seedPath}`);
  fail();
}

const parsed = seedSchema.safeParse(JSON.parse(readFileSync(seedPath, "utf8")));
if (!parsed.success) {
  for (const i of parsed.error.issues) err(`seed.json ${i.path.join(".")}: ${i.message}`);
  fail();
}
const seed = parsed.data;

// Unique keys
const dupes = (label: string, keys: string[]) => {
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) err(`duplicate ${label}: ${k}`);
    seen.add(k);
  }
  return seen;
};
const userKeys = dupes("user key", seed.users.map((u) => u.key));
dupes("user email", seed.users.map((u) => u.email));
const businessKeys = dupes("business key", seed.businesses.map((b) => b.key));
const briefSlugs = dupes("brief slug", seed.briefs.map((b) => b.slug));
const teamKeys = dupes("team key", seed.teams.map((t) => t.key));
const role = new Map(seed.users.map((u) => [u.key, u.role]));

for (const b of seed.businesses) {
  if (!userKeys.has(b.ownerKey)) err(`business ${b.key}: ownerKey ${b.ownerKey} not found`);
  else if (role.get(b.ownerKey) !== "business") err(`business ${b.key}: owner ${b.ownerKey} is not a business user`);
  if (!findCity(b.city)) err(`business ${b.key}: unknown city ${b.city}`);
  if (!findIndustry(b.industry)) err(`business ${b.key}: unknown industry ${b.industry}`);
}

for (const b of seed.briefs) {
  if (!businessKeys.has(b.businessKey)) err(`brief ${b.slug}: businessKey ${b.businessKey} not found`);
  if (!existsSync(path.join(prebakedDir, `${b.slug}.json`))) err(`brief ${b.slug}: missing seed/prebaked/${b.slug}.json`);
}

for (const t of seed.teams) {
  if (!briefSlugs.has(t.briefSlug)) err(`team ${t.key}: briefSlug ${t.briefSlug} not found`);
  for (const k of [t.leadKey, ...t.memberKeys]) {
    if (!userKeys.has(k)) err(`team ${t.key}: user ${k} not found`);
    else if (role.get(k) !== "student") err(`team ${t.key}: ${k} is not a student`);
  }
  if (t.memberKeys.includes(t.leadKey)) err(`team ${t.key}: lead ${t.leadKey} also listed in memberKeys`);
  if (new Set(t.memberKeys).size !== t.memberKeys.length) err(`team ${t.key}: duplicate memberKeys`);
}

for (const d of seed.deliveries) {
  if (!teamKeys.has(d.teamKey)) err(`delivery: teamKey ${d.teamKey} not found`);
  if (Number.isNaN(Date.parse(d.deliveredAt))) err(`delivery ${d.teamKey}: deliveredAt is not an ISO date`);
}
for (const e of seed.evaluations) if (!teamKeys.has(e.teamKey)) err(`evaluation: teamKey ${e.teamKey} not found`);
for (const e of seed.entities) if (!findCity(e.city)) err(`entity ${e.name.en}: unknown city ${e.city}`);

// Status consistency
const teamsFor = (slug: string) => seed.teams.filter((t) => t.briefSlug === slug);
const delivered = new Set(seed.deliveries.map((d) => d.teamKey));
const evaluated = new Set(seed.evaluations.map((e) => e.teamKey));
for (const b of seed.briefs) {
  const ts = teamsFor(b.slug);
  if (b.status === "in_progress" && !ts.some((t) => t.status === "approved"))
    err(`brief ${b.slug} (in_progress): needs an approved team`);
  if (b.status === "delivered" && !ts.some((t) => t.status === "delivered" && delivered.has(t.key)))
    err(`brief ${b.slug} (delivered): needs a delivered team with a delivery`);
  if (b.status === "evaluated" && !ts.some((t) => t.status === "delivered" && delivered.has(t.key) && evaluated.has(t.key)))
    err(`brief ${b.slug} (evaluated): needs a delivered team with a delivery and an evaluation`);
  if (["in_review", "rejected"].includes(b.status) && ts.length > 0)
    err(`brief ${b.slug} (${b.status}): should not have teams yet`);
  if (b.status === "rejected" && b.aiReview.recommendation === "approve")
    err(`brief ${b.slug} (rejected): aiReview recommendation should be reject/revise`);
}

// Prebaked files
const prebaked: Prebaked[] = [];
const files = existsSync(prebakedDir) ? readdirSync(prebakedDir).filter((f) => f.endsWith(".json")) : [];
for (const f of files) {
  const r = prebakedSchema.safeParse(JSON.parse(readFileSync(path.join(prebakedDir, f), "utf8")));
  if (!r.success) {
    for (const i of r.error.issues) err(`prebaked/${f} ${i.path.join(".")}: ${i.message}`);
    continue;
  }
  const p = r.data;
  prebaked.push(p);
  if (`${p.slug}.json` !== f) err(`prebaked/${f}: slug ${p.slug} does not match filename`);
  const brief = seed.briefs.find((b) => b.slug === p.slug);
  const biz = brief && seed.businesses.find((b) => b.key === brief.businessKey);
  if (!brief) err(`prebaked/${f}: no brief with slug ${p.slug}`);
  else if (biz && (biz.city !== p.city || biz.industry !== p.industryKey))
    err(`prebaked/${f}: city/industry (${p.city}/${p.industryKey}) differ from business (${biz.city}/${biz.industry})`);
  if (p.groundingLevel !== "ungrounded" && p.live.length === 0) err(`prebaked/${f}: grounded but no live sources`);
  for (const s of p.live) if (!/^https?:\/\//.test(s.url)) err(`prebaked/${f}: invalid url ${s.url}`);
  for (const s of p.live) if (!prebakedSourceIsOfficial(p, s)) err(`prebaked/${f}: not an official source for ${s.matchedCity ?? "national"}: ${s.url}`);
  if (p.groundingLevel !== "ungrounded" && p.live.length < 2) err(`prebaked/${f}: grounded on fewer than 2 sources`);
  if (p.groundingLevel !== "ungrounded" && !p.synthetic) err(`prebaked/${f}: synthetic is null`);
}

if (errors.length) fail();
console.log(
  `✓ seed valid: ${seed.users.length} users, ${seed.businesses.length} businesses, ${seed.briefs.length} briefs, ${seed.teams.length} teams, ${prebaked.length} prebaked`,
);
