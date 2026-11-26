# Judging map — how Yukikaki meets each criterion

Live: <https://project-yukikaki.vercel.app> (`/en`, `/ja`) · Repo: <https://github.com/amomusik/project-yukikaki>
Routes are relative to the live site. Files are relative to the repo root. Seeded businesses, events and evaluations are **demo data** and carry a Demo badge in the UI.

## 1. Useful in Hokkaido

| Claim | Evidence |
|---|---|
| It targets the Category B pain: small businesses losing hours to busywork with fewer hands | Brief fields `hours_lost_per_week` and `data_sensitivity` in `lib/db/schema.ts`. Interview agent spec in `docs/elevenlabs-agents.md` |
| Hokkaido-aware grounding: analog cities are picked by snowfall, January temperature, population, coastal, tourism and ageing | `lib/grounding/city-profiles.ts`, `lib/grounding/search.ts`. Sapporo → Asahikawa, Aomori, Nagano (`docs/architecture.md`) |
| Demo challenges are local (demo data): Sapporo snow dispatch, Sapporo ramen reservations, Asahikawa farm subsidy records, Otaru ryokan | `seed/seed.json`, `seed/prebaked/sapporo-snow-dispatch.json` and siblings. Route `/en/challenges` |
| Funding found: open public programmes matched from jGrants and filtered by area | `lib/grants/jgrants.ts`, `lib/grants/match.ts`, `lib/grants/areas.ts`. Routes `/en/grants`, `/api/grants` |
| Outcome is measured in hours saved per week, reported by the owner | `lib/feedback.ts`, `app/[locale]/feedback/[token]/`, `/admin?tab=impact` |
| Bilingual by default, for owners and international builders | `messages/en.json`, `messages/ja.json`, `i18n/routing.ts` |
| Fits real event formats: hackathon, design charrette, test kitchen | `event_format` enum in `lib/db/schema.ts`. `components/landing/formats-harness.tsx`. Route `/en/events` |

## 2. Technical build (real AI, not mocks)

| Partner | Real call | Evidence |
|---|---|---|
| ElevenLabs | Two Conversational AI agents (interview, impact). Signed URL, HMAC-verified webhook, polling fallback | `lib/integrations/elevenlabs.ts`, `app/api/elevenlabs/signed-url/route.ts`, `app/api/webhooks/elevenlabs/route.ts`, `app/api/interviews/complete/route.ts`, `scripts/setup-elevenlabs.ts`. Route `/en/interview` |
| Linkup | Official-domain-only search cascade, plus municipal grant enrichment | `lib/integrations/linkup.ts`, `lib/grounding/search.ts` |
| Adaption Labs | `POST /api/v1/datasets/invent` from grounding facts; reuses existing datasets; throws `UngroundedError` without sources | `lib/integrations/adaption.ts`, `lib/datasets/store.ts`, `app/api/datasets/[id]/route.ts` |
| Dify | Brief and team review workflows with PII scrubbing (recommendation only) | `dify/brief-review.yml`, `dify/team-review.yml`, `scripts/build-dify.ts`, `lib/integrations/dify.ts`, `scripts/smoke-dify.ts` |
| Neo4j | Challenge graph projection and skill-based builder suggestions | `lib/graph/cypher.ts`, `lib/graph/sync.ts`, `lib/graph/queries.ts`, `components/graph-view.tsx`. Route `/en/admin/graph` (host) |
| Neon | Postgres source of truth through the serverless driver | `lib/db/index.ts`, `lib/db/schema.ts`, `drizzle/` |

Also:

- **No silent mocks.** Every call goes through `withFallback` (`lib/integrations/_guard.ts`) and is logged in `service_events`. With `REQUIRE_LIVE_SERVICES=true` (`lib/env.ts`, `lib/pipeline/brief.ts`), failures become issues the host sees. `pnpm check:services` (`scripts/check-services.ts`) checks all eight services.
- **Pipeline:** `lib/pipeline/brief.ts`. Status machines in `lib/workflow/status.ts`. The only approval path is `lib/decide.ts`.
- **Tests:** `tests/` (unit, integration on PGlite, contract against recorded partner fixtures in `tests/contract/partners.test.ts`), `e2e/flow.spec.ts`, `e2e/a11y.spec.ts`, CI in `.github/workflows/ci.yml`.
- **Live AI evals, published honestly:** `evals/results/2026-11-26-summary.md`. 16 of 20 metrics pass. The 4 that fail (grant topic precision, grant coverage, grounding precision, business-name preservation) are shown as-is.

## 3. Demo & writeup (clear story)

| Item | Where |
|---|---|
| Writeup (EN / JA) | `docs/submission/writeup.md`, `docs/submission/writeup.ja.md` |
| Deck text (12 slides) | `docs/submission/deck.md` |
| 3-minute demo script (EN/JA lines, failure playbook) | `docs/demo-script.md` |
| Story arc | Snow path metaphor → missing prep → interview → grounded brief → safe data → host approval → grants → event and team → hours saved |
| Visuals | `docs/screenshots/`. Video and deck assets made with PixVerse, Hyper3D Rodin and Cascadeur |
| Honesty labels | Demo badges: `app/[locale]/events/page.tsx`, `app/[locale]/events/[slug]/page.tsx`, testimonials in `app/[locale]/page.tsx` + `lib/testimonials.ts`. Roadmap marked coming soon in `README.md#roadmap` and `components/landing/party-builder.tsx` |

## 4. Open & reusable

| Claim | Evidence |
|---|---|
| MIT licence, public repo | `LICENSE`, `package.json` (`"license": "MIT"`) |
| Fork for any town in five steps | `README.md` → "Run it in your town": `lib/grounding/city-profiles.ts`, `lib/grounding/industry-neighbors.ts`, `seed/seed.json` (schema in `lib/seed-schema.ts`), `/events/new` |
| Reproducible AI setup | Dify DSL files in `dify/`. `pnpm setup:elevenlabs`, `pnpm dify:build`, `pnpm smoke:dify`, `pnpm prebake` |
| Runs locally with no cloud accounts for browsing | PGlite fallback in `lib/db/pglite.ts` + seeded demo data; without Clerk keys public pages render and protected pages explain setup (`authEnabled()` in `lib/env.ts`). Sign-in and live features need your own keys; Yukikaki does not use Clerk keyless dev mode |
| Docs for operators and contributors | `docs/operator-guide.md`, `docs/deploy.md`, `docs/architecture.md`, `CONTRIBUTING.md`, `SECURITY.md` |
| Public JSON APIs | `/api/events`, `/api/challenges/search?q=`, `/api/grants`, `/api/events/[slug]/ics` |

## Compliance: grants & subsidies (行政書士)

Yukikaki discovers and matches programmes only. It never prepares applications. The notice appears on every grant view (`app/[locale]/grants/grant-list.tsx`, text in `messages/*.json` → `notice`) and in the API response (`app/api/grants/route.ts`). Eligibility checks are handed off to Grantline (`lib/grants/format.ts`).

## Not claimed (coming soon)

"Bring any team" AI helpers (the landing preview runs only in the browser), virtual product manager, and points & rewards. One shared waitlist: `lib/waitlist.ts`.
