# Evals — live, opt-in

Quality checks for the AI/LLM paths against the **real** partner services. They cost credits, so
they never run in CI on push/PR (manual `Evals (live, manual)` workflow only).

```bash
pnpm evals                       # prints the cost estimate, runs nothing (exit 2)
pnpm evals --yes                 # all suites
pnpm evals --yes --suite=brief-review --runs=2 --limit=6 --concurrency=3
pnpm evals --rebuild=2026-11-26  # re-render markdown/summary from saved JSON (no live calls)
```

| suite | what it calls | dataset | pass thresholds |
|---|---|---|---|
| `brief-review` | Dify brief-review workflow (~4 credits/run), each case ×2 | `datasets/brief-review.jsonl` (12 labelled cases: good, PII name/phone/email/address, mention-only, romanized name, phone variants, ungrounded, national, out-of-scope, name preservation) | JSON validity ≥ 0.95 · PII recall ≥ 0.9 · PII false-positive rate ≤ 0.15 · recommendation accuracy ≥ 0.75 · name preservation ≥ 0.85 · stability ≥ 0.75 |
| `grounding` | Linkup via `groundBrief` | `datasets/grounding.json` (8 city/industry pairs) | official domains only = 1 · city-or-analog = 1 · ≥2 sources ≥ 0.875 · precision proxy ≥ 0.6 |
| `grants` | jGrants public API via `matchGrants` (free, rate-limited; no Linkup) | `datasets/grants.json` (5 briefs with topic + known-bad keywords) | top-3 open = 1 · in area = 1 · on-topic ≥ 0.6 · no unrelated generic scheme ≥ 0.9 · briefs with 3 matches ≥ 0.6 |
| `interview` | ElevenLabs interview agent via `scripts/simulate-interview.ts --no-pipeline --persona=…` | `datasets/personas/*.json` (3 owners with ground truth) | schema parse = 1 · strict fields ≥ 0.66 · hours within ±20% ≥ 0.66 · industry ≥ 0.66 · city = 1 |

Results: `results/<date>-<suite>.json` + `.md`, and `results/<date>-summary.md`. The CLI exits 1 when any
metric is below its threshold. Evals never write to Neon (guards log to an in-memory PGlite).
