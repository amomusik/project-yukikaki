## Manual findings & fixes (reviewed 2026-11-26)

Hand-verified notes on top of the generated findings. `pnpm audit:orphans` appends this file to every report.

### Fixed (files owned by the audit)

| severity | where | finding | fix |
|---|---|---|---|
| bug | `lib/integrations/elevenlabs.ts:108` | `hours_lost_per_week` / `hours_saved_per_week`: a value with no digits ("たくさん") parsed to **0 h** instead of unknown, and "2時間半" parsed to 2 h (the impact persona literally answers "2時間半"). | No digits → `null`; "N時間半" → N+0.5. Covered by `tests/unit/aliases-and-hours.test.ts`. |
| dead code | `lib/grants/store.ts:13` | `GRANTLINE_URL_JA` exported, never used (the grants API only returns the EN link). | Deleted. |
| dead code | `lib/integrations/elevenlabs.ts:148` | `ImpactDraft` type never referenced. | Deleted. |
| dead code | `lib/seed-schema.ts:101` | `Seed` type never referenced. | Deleted. |
| cosmetic | `vitest.config.mts` | One flat suite; no coverage. | unit / integration / contract projects + v8 coverage. |

### Left for owners (report only)

| severity | where | finding | suggested fix |
|---|---|---|---|
| bug | `lib/workflow/status.ts:8` + `lib/decide.ts:61` | `rejected → in_review` is legal but `resubmitBrief()` has **no caller** in app code (only the new test). A rejected brief is a dead end for the owner. | Add a "Resubmit" admin/owner action in `app/[locale]/admin/actions.ts` calling `resubmitBrief`, or drop the edge. |
| bug | `messages/en.json:205` (`landing.formatsHarness.formats.charrette.gloss`) | Key exists only in `en`; `ja` falls through to `t.has()` = false, so the gloss silently disappears in Japanese. | Add the ja gloss (landing agent). |
| dead code | `components/landing/test-kitchen.tsx` | Whole component unused (nothing renders it); its `landing.kitchen.*` and `landing.formats.*` keys (≈40) are therefore dead too. | Delete the component + keys, or render it on the landing page. |
| dead code | `components/landing/hero-variant.ts:13` | `HERO_SKY` exported, never used. | Delete or use for the hero background. |
| cosmetic | `components/landing/mobile-action-bar.tsx:49` | Focus handler schedules `requestAnimationFrame` that can `setTyping` after unmount (no `cancelAnimationFrame`). Other landing effects (IntersectionObserver in `use-in-view.ts`, listeners) do clean up. | Track the rAF id and cancel it in the cleanup. |
| cosmetic | `lib/events/store.ts` | RSVP / event statuses have no transition table: any status can be written. `waitlist` is set via the computed `status` at `lib/events/store.ts:264` (verified manually; the static scan reports "default only"). | Add `RSVP_TRANSITIONS` / `EVENT_TRANSITIONS` + `assertTransition`. |
| dead code | `lib/db/schema.ts:127` | `data_sources.license` never read or written. | Drop in a migration or populate from Linkup/Adaption. |
| dead code | `lib/db/schema.ts:103,199,200,248` | Write-only: `briefs.source_language`, `feedback_tokens.sent_to_email`, `feedback_tokens.email_delivered`, `service_events.latency_ms`. | Surface in /admin (email delivery status is useful) or stop writing. |
| cosmetic | `app/[locale]/teams/new/page.tsx:17` | `searchParams` declares `unknown` but the page ignores it (`createTeamAction` redirects `?unknown=` to `/teams/[id]`, which does read it). | Remove `unknown` from the type. |
| cosmetic | `lib/db/index.ts:34` | `PGLITE_DIR` is validated in `lib/env.ts` but not documented in `.env.example`. | Add a commented `PGLITE_DIR=` line. |
| cosmetic | `package.json` | `@types/js-yaml` is redundant (js-yaml 5 ships its own types). | `pnpm remove @types/js-yaml`. |
| integration | Adaption `GET /api/v1/datasets/{id}/download?fileFormat=json` | Returned **HTTP 500** for a succeeded dataset when recording fixtures (list/status endpoints fine). `waitForRows` would surface this as a pipeline warning. | Re-check with Adaption; contract fixture `tests/fixtures/adaption-download.json` documents the expected shape. |
