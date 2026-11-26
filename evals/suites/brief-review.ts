import { readFileSync } from "node:fs";
import type { BriefContent } from "@/lib/db/schema";
import { reviewBrief, type BriefReview } from "@/lib/integrations/dify";
import { pool, rate, squash, type CaseResult, type Suite } from "../lib";

/**
 * Dify brief-review workflow (live). Each labelled case runs `runs` times (default 2) for stability.
 * Metrics: PII recall (detected AND no value leaked into normalized/issues/comment), PII false-positive
 * rate, recommendation accuracy vs label, business-name preservation, JSON validity, stability.
 */
type Case = {
  id: string;
  variant: string;
  content: BriefContent;
  transcript: string;
  sources: string;
  groundingLevel: string;
  meta: Record<string, unknown>;
  label: { expect: BriefReview["recommendation"][]; pii: string[]; names: { ja: string[]; en: string[] } };
};
const load = (): Case[] => readFileSync("evals/datasets/brief-review.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const CREDITS_PER_RUN = 4;

/** Values longer than a surname (or phones/emails) must never reappear; a bare surname may legitimately be a business word. */
function leaked(review: BriefReview, values: string[]): string[] {
  const text = [JSON.stringify(review.normalized ?? {}), ...review.issues, review.grounding_comment].join("\n");
  const flat = squash(text).toLowerCase();
  return values.filter((v) => {
    const isPhone = /\d{3}/.test(squash(v));
    return isPhone ? flat.includes(squash(v).replace(/^81/, "0")) || flat.includes(squash(v)) : text.toLowerCase().includes(v.toLowerCase());
  });
}

export const briefReview: Suite = {
  name: "brief-review",
  estimate: ({ runs, limit }) => {
    const n = Math.min(load().length, limit ?? Infinity);
    return `Dify brief-review: ${n} cases × ${runs} runs = ${n * runs} workflow runs ≈ ${n * runs * CREDITS_PER_RUN} Dify credits (~${CREDITS_PER_RUN}/run, 4 LLM nodes each)`;
  },
  async run({ runs, limit, concurrency }) {
    const cases = load().slice(0, limit ?? undefined);
    const errors: string[] = [];
    const jobs = cases.flatMap((c) => Array.from({ length: runs }, (_, r) => ({ c, r })));
    const outs = await pool(jobs, concurrency, async ({ c, r }) => {
      const t0 = Date.now();
      try {
        const review = await reviewBrief({ content: c.content, transcript: c.transcript, sources: c.sources, groundingLevel: c.groundingLevel, meta: JSON.stringify(c.meta) });
        process.stderr.write(`  · ${c.id}#${r + 1} ${review.recommendation} ${review.score} pii=${review.pii_found} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
        return { c, r, review, error: null as string | null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${c.id}#${r + 1}: ${msg.slice(0, 300)}`);
        process.stderr.write(`  · ${c.id}#${r + 1} ERROR ${msg.slice(0, 120)}\n`);
        return { c, r, review: null, error: msg };
      }
    });

    let valid = 0, recOk = 0, piiCases = 0, piiCaught = 0, cleanCases = 0, falsePos = 0, nameCases = 0, nameOk = 0, stable = 0;
    const caseResults: CaseResult[] = [];
    for (const c of cases) {
      const mine = outs.filter((o) => o.c.id === c.id);
      const recs: string[] = [];
      const details: Record<string, unknown>[] = [];
      let casePass = true;
      for (const o of mine) {
        if (!o.review) {
          casePass = false;
          details.push({ run: o.r + 1, error: o.error?.slice(0, 120) });
          continue;
        }
        valid++;
        const rv = o.review;
        recs.push(rv.recommendation);
        const recGood = c.label.expect.includes(rv.recommendation);
        if (recGood) recOk++;
        const leaks = leaked(rv, c.label.pii);
        let piiGood = true;
        if (c.label.pii.length) {
          piiCases++;
          piiGood = rv.pii_found && leaks.length === 0;
          if (piiGood) piiCaught++;
        } else {
          cleanCases++;
          if (rv.pii_found) falsePos++;
          piiGood = !rv.pii_found;
        }
        // Only score name preservation when the business name is actually in the brief text
        // (meta-only names are not expected to appear in the rewritten brief).
        const inputText = JSON.stringify(c.content) + c.transcript;
        const nameApplies = c.label.names.ja.some((n) => inputText.includes(n)) || c.label.names.en.some((n) => inputText.toLowerCase().includes(n.toLowerCase()));
        let nameGood = true;
        if (!nameApplies) nameGood = true;
        else if (rv.normalized) {
          nameCases++;
          const ja = rv.normalized.ja ? JSON.stringify(rv.normalized.ja) : "";
          const en = rv.normalized.en ? JSON.stringify(rv.normalized.en).toLowerCase() : "";
          nameGood = c.label.names.ja.some((n) => ja.includes(n)) && c.label.names.en.some((n) => en.includes(n.toLowerCase()));
          if (nameGood) nameOk++;
        } else nameGood = false;
        casePass &&= recGood && piiGood && nameGood;
        details.push({ run: o.r + 1, rec: rv.recommendation, score: rv.score, pii_found: rv.pii_found, leaks, name_kept: nameApplies ? nameGood : "n/a", en_title: rv.normalized?.en.title, en_problem: rv.normalized?.en.problem?.slice(0, 160), ja_problem: rv.normalized?.ja.problem?.slice(0, 100) });
      }
      if (recs.length === runs && new Set(recs).size === 1) stable++;
      caseResults.push({ id: `${c.id} (${c.variant})`, pass: casePass, details: { expect: c.label.expect, runs: details } });
    }
    const total = jobs.length;
    return {
      metrics: [
        { name: "json_validity", value: rate(valid, total), threshold: 0.95 },
        { name: "pii_recall (detected & nothing leaked)", value: rate(piiCaught, piiCases), threshold: 0.9 },
        { name: "pii_false_positive_rate", value: rate(falsePos, cleanCases), threshold: 0.15, higherIsBetter: false },
        { name: "recommendation_accuracy", value: rate(recOk, valid), threshold: 0.75 },
        { name: "business_name_preservation", value: rate(nameOk, nameCases || valid), threshold: 0.85 },
        { name: "stability (same recommendation across runs)", value: rate(stable, cases.length), threshold: 0.75 },
      ],
      cases: caseResults,
      errors,
    };
  },
};
