# Live eval scores — 2026-11-26

All suites ran live against the real services with `pnpm evals --yes` (cost estimate printed first). Thresholds
are unchanged from `evals/README.md`. Per-suite details: `2026-11-26-<suite>.{json,md}`.

**Spend:** Dify 24 workflow runs (≈ 96 of ~4,900 credits) · Linkup 8 pairs, all resolved at the first (exact-city)
step (≈ 24 searches, ≈ €0.12) · jGrants free · ElevenLabs 0 (re-run blocked, see note).

| suite | metric | score | threshold | pass |
|---|---|---|---|---|
| brief-review | JSON validity | 1.00 (24/24) | ≥ 0.95 | ✅ |
| brief-review | PII recall (detected & nothing leaked) | 1.00 (10/10) | ≥ 0.90 | ✅ |
| brief-review | PII false-positive rate | 0.00 (0/14) | ≤ 0.15 | ✅ |
| brief-review | recommendation accuracy | 1.00 (24/24) | ≥ 0.75 | ✅ |
| brief-review | business-name preservation | 0.667 (12/18) | ≥ 0.85 | ❌ |
| brief-review | stability (same verdict across 2 runs) | 1.00 (12/12) | ≥ 0.75 | ✅ |
| grounding | official domains only | 1.00 (8/8 pairs) | = 1 | ✅ |
| grounding | city or analog-city match | 1.00 (8/8) | = 1 | ✅ |
| grounding | ≥ 2 sources | 1.00 (8/8) | ≥ 0.875 | ✅ |
| grounding | precision proxy (official ∧ city ∧ on-topic) | 0.479 (23/48 sources) | ≥ 0.60 | ❌ |
| grants | top-3 open | 1.00 (8/8) | = 1 | ✅ |
| grants | top-3 in area | 1.00 (8/8) | = 1 | ✅ |
| grants | top-3 on topic (keyword overlap) | 0.375 (3/8) | ≥ 0.60 | ❌ |
| grants | no unrelated generic scheme | 1.00 (8/8) | ≥ 0.90 | ✅ |
| grants | briefs with 3 matches (coverage) | 0.40 (2/5) | ≥ 0.60 | ❌ |
| interview* | schema parse | 1.00 (3/3) | = 1 | ✅ |
| interview* | all 11 fields present & typed | 1.00 (3/3) | ≥ 0.66 | ✅ |
| interview* | hours within ±20 % | 1.00 (3/3, exact) | ≥ 0.66 | ✅ |
| interview* | industry correct | 1.00 (3/3) | ≥ 0.66 | ✅ |
| interview* | city correct | 1.00 (3/3) | = 1 | ✅ |

\* Interview scores come from the live run at 12:27 JST today (3 real ElevenLabs conversations, ids in
`2026-11-26-interview.json`). The re-run at 15:26 JST could not finish: ElevenLabs returned *"exceeds your quota of
10000 … 0 credits remaining"* mid-conversation for all 3 personas (`2026-11-26-interview-rerun-blocked.md`). That
is a billing blocker, not a quality result.

## Findings (real model/retrieval behaviour, not label errors; datasets left unchanged)

- **Name preservation (brief-review).** The Japanese text always keeps the name. The English rewrite drops it in 4/18
  runs: 「麺屋ゆき」 becomes "a ramen shop in Sapporo" and 「ゲストハウス雪あかり」 becomes "a guesthouse near Otaru Canal"
  (both runs of both cases). In 2/18, "Morino Farm" comes out as katakana モリノファーム in the ja field even though
  meta gives 森野ファーム. Fix this in the Dify translate prompt ("keep proper nouns / business names verbatim").
- **Grounding precision.** Every source was official and in the right city, but many are generic city pages (DX
  policy, open-data catalogues on harp.lg.jp, procurement) that don't mention the industry. The worst pairs were
  Asahikawa/construction and Hakodate/bakery (6/6 off-topic each) and Otaru/guesthouse (5/6). The industry
  terms in the query plan should be required, not just preferred.
- **Grants.** Everything shown is open, in-area and not an obviously wrong scheme. But jGrants has few open listings
  in late November: Otaru/guesthouse got 0 matches, ramen/farm got 1. Several top-3 matches are adjacent rather
  than on-topic (受動喫煙防止対策助成金 for ramen and care, 働き方改革推進支援助成金 for construction). Note: this run
  used the working-tree `lib/grants/match.ts`, which another agent is changing.

## Demo-slide takeaways

- **PII leaked in 0/24 Dify runs.** Names, phones, emails and home addresses were caught in 10/10 PII runs, with
  0/14 false alarms on clean briefs. Verdicts matched the label in 24/24 Dify runs and never changed between runs.
- **100 % official, local sources:** 48/48 grounding sources were go.jp / lg.jp / city sites for the right city (or
  its analog city), with ≥ 2 sources for 8/8 businesses. Every recommended grant was open and in the right area.
- **Voice interview → structured brief, 3/3:** every simulated owner interview gave a valid 11-field brief with exact
  hours lost per week, the right industry and the right city. Known gap still being fixed: English rewrites sometimes
  drop the shop name (12/18 kept).
