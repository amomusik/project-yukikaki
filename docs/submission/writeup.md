# Yukikaki 雪かき — AI-native hackathons for Sapporo and beyond

**Team Snowball · Hack Hokkaido Build Week, Sapporo, Nov 2026 · Category B: "Fewer hands, same town"**
Live: <https://project-yukikaki.vercel.app> · Code (MIT): <https://github.com/amomusik/project-yukikaki>

> Like Peatix or Luma — for hackathons, with the prep done and the funding found.
> *Nemawashi done. Mise en place ready.*

## The problem

Hokkaido towns are losing hands. Snow-removal firms, ramen shops, ryokan and farms lose hours every week to phone bookings, dispatch calls and subsidy paperwork. Students can already automate much of it with AI, but the work *before* a hackathon never gets done: a real owner's problem, data they may use, buy-in from the people who must say yes (*nemawashi*, 根回し), a venue, funding, and a team that stays after the demo.

In a Hokkaido winter, someone shovels the path before anyone else can get through. That's *yukikaki*: necessary work nobody wants to do.

## The insight

Builders aren't the bottleneck; the prep is. If AI agents do the legwork and people make every call, one town host can run what used to take a committee. The result is a **test kitchen for ideas and prototypes**: a shop brings a problem, a team prototypes it, the owner tries it for a normal week, and an impact check decides: keep, rework or drop.

## What we built

A bilingual (EN/JA) Next.js 15 web app, deployed on Vercel in Tokyo (`hnd1`). Every page exists at `/en` and `/ja`.

1. **Voice interview → brief.** The owner talks to an ElevenLabs agent for about ten minutes, or uses a text form. The agent's data-collection fields become a draft brief in Japanese and English: problem, current process, hours lost per week, data sensitivity.
2. **Grounding from official sources only.** Linkup searches only `go.jp`, `lg.jp`, `or.jp`, `ac.jp` and the city's own site. If the exact city has nothing usable, the cascade moves to *analog cities* with similar snowfall, January temperature, population and ageing (Sapporo → Asahikawa, Aomori, Nagano), then national statistics. If nothing official turns up, the brief is marked `ungrounded`.
3. **Synthetic stand-in data.** Adaption Labs generates fictional Japanese rows, seeded only from those grounding facts, so builders never touch the owner's private data. Ungrounded briefs get no synthetic data, and the code throws if anything tries.
4. **AI pre-review, human decision.** A Dify workflow checks privacy, feasibility, grounding and bilingual quality. Verified PII is scrubbed, and if any was found the recommendation is forced to "revise". Only a host can approve, through one audited code path (`decide()`).
5. **Challenge graph.** Neo4j links challenges to businesses, cities, datasets, skills, builders, local stakeholders, venues and funders, and suggests builders by skill.
6. **Grants, auto-matched.** On approval, open programmes are matched from the Digital Agency's official **jGrants** API (optionally enriched by Linkup), showing deadline, amount and rate, with a hand-off to Grantline for eligibility checks.
7. **Events + RSVP.** Hackathons, design charrettes and test-kitchen sessions, with capacity, waitlist auto-promotion, `.ics` export and share links. Each event page shows its challenges and their top grant matches.
8. **Teams, delivery, impact.** One named lead per team (enforced by a database index) is the owner's single contact and stays on as support contact for 90 days after delivery. The host sends a single-use, 14-day impact link. The owner answers a form or a voice review (a second ElevenLabs agent), and `/admin` totals **hours saved per week**.

## Partner tools — what each one actually does

| Partner | Real job in the app |
|---|---|
| **ElevenLabs** | Two Conversational AI agents: the owner interview and the impact voice review. Signed URLs, HMAC-verified post-call webhook. |
| **Linkup** | Official-domain-only grounding cascade with citations, plus optional municipal grant enrichment. |
| **Adaption Labs** | `datasets/invent` creates grounded synthetic Japanese rows; existing `yukikaki:{industry}:{city}` datasets are reused. |
| **Dify** | Two importable workflows (`dify/brief-review.yml`, `dify/team-review.yml`): pre-review plus PII scrubbing. Recommendation only. |
| **Neo4j** | Challenge graph and skill-based builder suggestions; a projection that `pnpm graph:rebuild` can always rebuild. |
| **Neon** | Serverless Postgres: the source of truth for every record, decision and service call. |

Clerk handles sign-in and Resend sends the emails. Every external call goes through one guard (`withFallback`) that applies a timeout and logs a `service_events` row.

## Real vs demo

- **Real:** the pipeline, every partner call, jGrants matching, RSVP and waitlist logic, host decisions and the audit log. In production `REQUIRE_LIVE_SERVICES=true`, so a failed call is shown to the host as an issue and never swapped for canned data.
- **Demo data:** the eight seeded businesses (Sapporo, Asahikawa, Otaru and five other towns), their teams, evaluations and three events are fictional. The UI marks them with a *Demo* badge. Their sources and stand-in data were produced by running the live pipeline (`pnpm prebake`).
- **Evals** (`evals/results/2026-11-26-summary.md`) are published as-is. 16 metrics pass and 4 fail, including grant on-topic precision (0.375) and grounding precision (0.5). We're tuning both.

## Grants & subsidies compliance (行政書士)

Since January 2026, preparing grant applications for a fee is reserved to licensed administrative scriveners (行政書士). Yukikaki only **discovers and matches** programmes. Every grant view, and the `/api/grants` response, carries that notice, and the host files with a licensed professional. We don't draft applications.

## Open & reusable

MIT-licensed. To fork it for a new town: add a row to `lib/grounding/city-profiles.ts` (snowfall, temperature, population, official domain), list local stakeholders, venues and funders in `seed/seed.json`, and deploy. Dify workflows import as DSL, `pnpm setup:elevenlabs` creates both voice agents, and `pnpm check:services` checks all eight services. CI runs unit, integration, contract, Playwright and axe accessibility tests.

## What's next (coming soon, not yet live)

- **Bring any team:** AI helpers to fill missing prep roles (Researcher, Scout, Fundraiser, Diplomat, Translator, Data chef). The landing preview runs in the browser only.
- **Virtual product manager:** an AI PM that checks in, spots blockers and nudges deadlines. It proposes; people decide.
- **Points & rewards** for building, mentoring and measured impact.
- Better grant and grounding precision, and more Hokkaido city profiles.

All three features share one waitlist on the landing page.

## Team & credits

Built by **Team Snowball** in Sapporo. Partners: ElevenLabs, Linkup, Neo4j, Dify, Neon, Adaption Labs. Also Clerk, Resend, jGrants (デジタル庁) and Grantline. We made the video and deck assets with **PixVerse** (video clips), **Hyper3D Rodin** (3D models) and **Cascadeur** (character animation). The 8-bit art is in `public/images`.
