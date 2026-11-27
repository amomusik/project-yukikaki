# Project Yukikaki 雪かき: feature inventory and demo plan

*Your test kitchen for ideas and prototypes.* Like Peatix or Luma, but for hackathons, with the prep done and the funding found.

- **Event:** Hack Hokkaido Build Week, Sapporo, Nov 2026. Team Snowball. Category B, "Fewer hands, same town".
- **Live:** https://project-yukikaki.vercel.app (`/en`, `/ja`). **Repo:** github.com/amomusik/project-yukikaki (MIT).
- **Judged on** a ≤3-min video, a writeup and a deck. Four equal criteria: **H** Useful in Hokkaido · **T** Technical build (real AI) · **D** Demo & writeup · **O** Open & reusable.
- **Partner tags:** ElevenLabs, Linkup, Neo4j, Dify, Neon, Adaption Labs. PixVerse, Hyper3D Rodin and Cascadeur are for the video and deck only. Also in the build: Clerk, Resend, jGrants (デジタル庁), and a Grantline hand-off.
- **Sources:** inventory read from the code at `HEAD 2c16012` plus the working tree. Screenshots retaken from the live site after the copy-streamlining deploy landed (26 Nov 2026, ~15:35 JST). Quoted on-screen copy matches that deploy.

Status key: **LIVE** = works on the live site with real services · **LIVE (host)** = live, but needs host sign-in · **DEMO-DATA** = real UI showing seeded demo records (labelled "Demo data / Demo event" on screen) · **PREVIEW** = runs in the browser only, with a fixed mapping · **SOON** = coming soon (waitlist only).

---

## 1. Inventory

### A. Discovery (landing, search, challenges, events)

| # | Feature | What it does | Partner tech | Status | Route / how to show |
|---|---|---|---|---|---|
| A1 | 8-bit hero | Snowy night: a person shovels a path to a lit hall where builders wait. "Your test kitchen for ideas and prototypes." / "We do the groundwork, so builders start on day one." Three chips (Find a local hackathon · Problems, data and teams prepped · Grants matched for you), two CTAs ("Bring a problem", "For hosts") | — (Next.js + art) | LIVE | `/en`, `/ja` → shots 01, 02 |
| A2 | Hero search with live suggestions | Type-ahead combobox over published challenges (town, industry, skill). Shows status, h/week lost and skill tags; Enter goes to the full results | Neon (`/api/challenges/search`) | LIVE | `/en`, type "snow" → shot 03 |
| A3 | Challenge marquee | Two auto-scrolling rows of challenge cards (status, hours lost, town, skills) with a "Pause scrolling" control | Neon | LIVE (DEMO-DATA cards) | `/en#on-the-path` "Challenges waiting for builders" → shot 04 |
| A4 | Hours-given-back counter | Count-up of the total hours saved per week, from the owners' impact checks (currently 14 h/w) | Neon | LIVE (DEMO-DATA value) | `/en`, below the marquee |
| A5 | "Why" problem statement | "Most local ideas stall before anyone builds." The groundwork takes months; we do it first, like shovelling the path | — | LIVE | `/en#why` → shot 20 |
| A6 | Closing CTA | "Fewer hands, same town." Bring a problem / For hosts. (The old how/principles/wins strips are gone in the new deploy; the guardrails now sit in the party-builder note and README) | — | LIVE | bottom of `/en` |
| A7 | Challenges board | Search plus filters for city, industry and skill. Cards show status, Live/Synthetic badges and h/week lost | Neon | LIVE (DEMO-DATA) | `/en/challenges` → shot 07 |
| A8 | Challenge detail | Bilingual brief (Problem / Today / Goal), skills, current tools, Data & grounding, grants, a Neo4j graph panel and the teams on it | Linkup, Adaption, Neo4j, jGrants | LIVE | `/en/challenges/<id>` → shots 08–10 |
| A9 | Nav + footer | Nav: Events · Challenges · Grants · Bring a problem (→ interview) · 日本語 · Sign in. Footer: "Like shoveling snow, we clear the path so builders can get to work." / "MIT-licensed open source. Any town can run it." plus a GitHub link | — | LIVE | header, footer (shot 17) |
| A10 | Mobile layout | Mobile nav, a sticky mobile action bar and a responsive hero | — | LIVE | 390×844 → shots 18, 19 |

### B. Owner flow (voice interview, text form, brief)

| # | Feature | What it does | Partner tech | Status | Route |
|---|---|---|---|---|---|
| B1 | Voice interview | About 10 minutes with an ElevenLabs agent in polite Japanese or English. Data-collection fields (problem, today's process, h/week lost, data sensitivity) become a draft brief in JA and EN | **ElevenLabs** (signed URL, post-call webhook, polling locally) | LIVE (sign-in) | `/en/interview`: **record live while signed in** |
| B2 | Text interview form | The same fields, typed. Also the fallback if voice fails | — | LIVE (sign-in) | `/en/interview` |
| B3 | "My briefs" | The owner sees their briefs and statuses and can start a new interview | Neon | LIVE (sign-in) | `/en/me` |
| B4 | Onboarding | Pick your role (business / student) on first sign-in. Users are mirrored from Clerk into Postgres | Clerk, Neon | LIVE | `/en/onboarding` |
| B5 | Brief pipeline | draft → enriching → in_review: grounding, then synthetic data, then Dify review, all through one guard (`withFallback`, timeout plus a `service_events` row) | Linkup, Adaption, Dify, Neon | LIVE | `lib/pipeline/brief.ts`. Show the results in `/admin` |
| B6 | Agent setup / simulation | `pnpm setup:elevenlabs` creates both agents from the docs. `pnpm simulate:interview` runs agent-to-agent tests with no microphone | ElevenLabs | LIVE (CLI) | terminal B-roll |

### C. Grounding and data

| # | Feature | What it does | Partner tech | Status | Route |
|---|---|---|---|---|---|
| C1 | Official-sources-only grounding | Linkup search is limited to `go.jp`, `lg.jp`, `or.jp`, `ac.jp` and the city's own site. Blogs and other municipalities' sites are rejected. Every source is stored with its URL | **Linkup** | LIVE | Challenge detail, "Data & grounding" → shot 09 (Sapporo 社会福祉協議会 and city pages) |
| C2 | Grounding cascade | Search widens from the exact city → analog cities (similar snowfall, January temperature, size, coastal, aging) → adjacent industries → national statistics. Badges show the level reached (`groundedOn`, matched city) | Linkup + `city-profiles.ts` | LIVE | challenge detail, admin queue |
| C3 | Cite or say you can't | If nothing official is found, the brief is marked `ungrounded`, no synthetic data is made, and the host is told | — | LIVE | admin queue badges |
| C4 | Synthetic stand-in data | Adaption Labs generates fictional Japanese rows, seeded only from the grounding facts. Builders never touch the owner's real data | **Adaption Labs** | LIVE | "合成 / Synthetic" badge. `/api/datasets/<id>` |
| C5 | Prebake / seed | `pnpm prebake` runs the real pipeline on the seed briefs and stores the outputs for demo seeding | all | CLI | — |

### D. AI review (Dify) and the host

| # | Feature | What it does | Partner tech | Status | Route |
|---|---|---|---|---|---|
| D1 | 7-step brief review | ① Intake → ② Privacy scan → ③ Student-scope feasibility → ④ Grounding audit → ⑤ Bilingual editor (JA/EN) → ⑥ House rules and recommendation → ⑦ Return to admin | **Dify** (`dify/brief-review.yml`, built by `pnpm dify:build`) | LIVE | `/admin` brief card (AI badge, score, issues). **Record while signed in as host**, plus Dify canvas B-roll |
| D2 | Deterministic PII scrub | Only values that literally appear in the input count as PII. They, and romanised forms of names, are removed from the brief text and issues by code, not by the model. Any PII forces the recommendation to "revise". Unit-tested on the real Python node | Dify code node | LIVE | `/admin` PII check line |
| D3 | 6-step team review | ① Intake → ② Roster and lead check → ③ Skill fit → ④ Pitch and delivery plan → ⑤ House rules → ⑥ Return | **Dify** (`dify/team-review.yml`) | LIVE | `/admin?tab=teams` |
| D4 | Host decides (single code path) | `decide()` checks the host role and the status transition, then writes a `decisions` audit row. AI only recommends | Neon | LIVE (host) | `/admin`: Approve / Reject with a note |

### E. Host / admin

| # | Feature | What it does | Partner tech | Status | Route |
|---|---|---|---|---|---|
| E1 | Review queue | Tabs: Briefs / Teams / Deliveries / Impact, plus recent decisions | Neon | LIVE (host) | `/en/admin`: **host sign-in** |
| E2 | Re-run enrichment | Re-runs grounding, synthetic data and review on a brief (`reEnrichAction`) | Linkup, Adaption, Dify | LIVE (host) | `/admin` brief card |
| E3 | Service status strip | One chip per service, from the latest `service_events`. `pnpm check:services` exits non-zero unless all 8 are live | all | LIVE (host) | `/admin` top strip |
| E4 | Challenge graph | Force graph: challenges, businesses, cities, datasets, skills, builders, teams, deliveries, stakeholders, venues, funders. Plus a "rebuild graph" button | **Neo4j** | LIVE (host) | `/en/admin/graph` + challenge-detail panel |
| E5 | Find / refresh grants | A host-only button on a challenge runs jGrants matching (and Linkup enrichment) | jGrants, Linkup | LIVE (host) | challenge detail grants header |
| E6 | Host-created events | Create, edit, publish and cancel events (format, venue, capacity, linked challenges) | Neon | LIVE (host) | `/en/events/new`, `/events/<slug>/edit` |

### F. Teams and delivery

| # | Feature | What it does | Partner tech | Status | Route |
|---|---|---|---|---|---|
| F1 | One named lead | The creator becomes lead. A partial unique index in Postgres allows exactly one lead per team. The lead is the owner's single contact | Neon | LIVE (sign-in) | `/en/teams/new`, `/en/teams/<id>` (Lead badge) |
| F2 | Lead transfer | Hands the lead role to another member | Neon | LIVE | team page |
| F3 | Builder suggestions | Suggests builders by skill from the graph, with a SQL fallback | Neo4j | LIVE | challenge detail |
| F4 | Delivery + 90-day support | The lead submits a summary, links and handover notes, and is recorded as support contact (`support_until` = +90 days) | Neon | LIVE | `/en/teams/<id>/deliver` |

### G. Impact

| # | Feature | What it does | Partner tech | Status | Route |
|---|---|---|---|---|---|
| G1 | Single-use impact link | The host sends a link that works once and expires after 14 days. Only an HMAC hash of the token is stored. If email can't be sent, the link appears in `/admin` with a Copy button | **Resend** | LIVE (host) | `/admin?tab=deliveries` → "Send impact check" |
| G2 | Questionnaire | Hours saved per week, satisfaction, still in use?, would recommend?, issues (free text) | Neon | LIVE | `/en/feedback/<token>` |
| G3 | Voice impact review | A second ElevenLabs agent takes a ~3-minute spoken review | **ElevenLabs** | LIVE | `/feedback/<token>` |
| G4 | Hours-saved total | The Impact tab sums hours per week. The landing counter and testimonials ("14 h/week saved") reuse owners' own words | Neon | LIVE (DEMO-DATA) | `/admin?tab=impact`, `/en#voices` → shot 15 |
| G5 | Floating hero quote | Footer quote in the hero sky that hides on scroll (owner quote, labelled Demo data) | — | LIVE | `/en` bottom of hero (shot 01) |

### H. Grants and subsidies

| # | Feature | What it does | Partner tech | Status | Route |
|---|---|---|---|---|---|
| H1 | jGrants live matching | On approval, open national programmes are matched from the official jGrants API (Digital Agency, no key). Shows deadline, days left, max amount, rate and area | jGrants | LIVE | `/en/grants` → shot 11; challenge detail → shot 10 |
| H2 | Municipal programmes | Linkup finds programmes on official city sites, badged "Municipal site · verify dates" (e.g. 札幌市 除雪事業者向け支援, 小型除雪機購入費の補助) | **Linkup** | LIVE | shot 10 |
| H3 | Grantline hand-off | "Check eligibility on Grantline ↗" on every grant | Grantline | LIVE | shots 10, 11 |
| H4 | 行政書士 notice | Shown on every grant view: Yukikaki only discovers and matches. Since Jan 2026, preparing applications for a fee is reserved to licensed administrative scriveners | — | LIVE | top of `/en/grants` |
| H5 | Event-level grants | Each event page lists the top grants for its linked challenges | jGrants | LIVE | shot 14 |
| H6 | Funders in the graph | Funders are graph entities linked to challenges and cities | Neo4j | LIVE (host) | `/admin/graph` |
| H7 | Scheduled refresh | `/api/grants/refresh` (cron) and `scripts/grants-refresh.ts` keep matches current | jGrants | LIVE | — |

### I. Events (Luma-style)

| # | Feature | What it does | Partner tech | Status | Route |
|---|---|---|---|---|---|
| I1 | Event list | Timeline cards with date tile, time (JST), venue, format chip, spots left, attendee avatars. Filter by city, format and month | Neon | LIVE (DEMO-DATA events) | `/en/events` → shot 12 |
| I2 | Event detail | Cover, host, going list, a registration card with a capacity bar, About, linked challenges and grants | Neon, jGrants | LIVE | `/en/events/sapporo-snow-tech-hackathon-2027` → shots 13, 14, 19 |
| I3 | RSVP + roles | RSVP as participant, mentor or observer. Confirmation email | Resend | LIVE (sign-in) | event page |
| I4 | Waitlist + auto-promotion | When full, you join the waitlist. When someone cancels, the next person is promoted automatically, in the same transaction, and emailed | Neon, Resend | LIVE | Setagaya test kitchen ("Full · 2 on waitlist") |
| I5 | ICS + share | "Add to calendar" (`/api/events/<slug>/ics`) and a share button | — | LIVE | event page |
| I6 | Three formats | `hackathon`, `charrette`, `test_kitchen` (an enum) | — | LIVE | format filter |

### J. Graph (Neo4j)

Neo4j is a projection of Neon and can always be rebuilt (`pnpm graph:rebuild`). It gives the challenge neighbourhood panel, builder suggestions, stakeholders, venues and funders, and the host's full graph at `/admin/graph`. **LIVE (host)**. Show it on the challenge detail (bottom) or in `/admin/graph`.

### K. Interactive storytelling

| # | Feature | What it does | Status | Route |
|---|---|---|---|---|
| K1 | 8-bit hero art + snow flurry | Pixel-art night scene that sets the brand | LIVE | `/en` |
| K2 | Kitchen quest | A 4-step walk through a pixel kitchen: Bring a problem → Prototype in days → Taste it in real work → Keep, rework or drop. Typewriter copy, autoplay, keyboard control, "What Yukikaki does here" per step | LIVE | `/en#kitchen-quest` → shot 05 |
| K3 | Formats harness | "Same prep, any format": three pixel rooms (Hackathon / Design charrette / Test kitchen) × Before/During/After phases | LIVE | `/en#formats-harness` → shot 06 |
| K4 | Mascot / 404 | Branded not-found page | LIVE | any bad URL |

### L. Roadmap / coming soon

| # | Feature | What it does | Status | Route |
|---|---|---|---|---|
| L0 | "What's coming next" cards | Three COMING SOON cards (Bring any team · Virtual product manager · Points & rewards), "one waitlist covers all three" | SOON | `/en#roadmap` → shot 21 |
| L1 | Bring any team: AI teammates | "Try it: who's on your team?" party builder: Students + Shop owner preselected; helper robots fill the other prep roles (Researcher, Scout, Fundraiser, Diplomat, Translator, Data chef). Hero teaser card "Bring any team" | PREVIEW (fixed mapping, in-browser) / SOON | `/en#party` → shot 16 |
| L2 | Virtual product manager | An AI PM that checks in, spots blockers and nudges deadlines | SOON | waitlist checkbox |
| L3 | Points & rewards | Points, badges and a season leaderboard for joining, delivering, mentoring and hours saved | SOON | waitlist checkbox |
| L4 | Shared waitlist | One form (email, org, role, features) with a confirmation email | LIVE | `/en#roadmap` |

### M. Platform and quality

| # | Feature | What it does | Status |
|---|---|---|---|
| M1 | i18n EN/JA | Every page at `/en` and `/ja`, with every string in both message files. A locale toggle sits in the header. JA copy is natural, not machine-literal | LIVE |
| M2 | Live-only mode | With `REQUIRE_LIVE_SERVICES=true` (production) nothing is faked. A failed call shows as an issue on the brief | LIVE |
| M3 | Tests | Vitest unit / integration (PGlite) / contract (recorded partner fixtures, zod), with V8 coverage | in repo |
| M4 | E2E + a11y | Playwright full flow (owner → host → team → delivery → impact) and axe WCAG 2.1 A/AA | in repo |
| M5 | Evals | `pnpm evals`: brief-review, grounding, grants and interview suites against the live partners. Shows a cost estimate and needs `--yes` | in repo |
| M6 | CI | Typecheck, lint, knip, orphan audit, migration drift, tests and Playwright on every push | in repo |
| M7 | Orphan audit | `pnpm audit:orphans` → `docs/audit/orphans-2026-11-26.md` | in repo |
| M8 | Impeccable design checks | `.github/skills/impeccable`, plus review agents (finish, motion, asset) and hooks | in repo |
| M9 | Deploy | Vercel pinned to `hnd1` Tokyo, Neon `aws-ap-southeast-1`, `pnpm vercel:env` (never prints values) | LIVE |

### N. Open and reusable

| # | Feature | What it does |
|---|---|---|
| N1 | MIT licence | "Any town can fork it." CONTRIBUTING, SECURITY and a bilingual README |
| N2 | Setup scripts | `db:push`, `seed`, `seed:events`, `graph:rebuild`, `check:services`, `setup:elevenlabs`, `dify:build`, `smoke:dify` |
| N3 | Add your town | Five steps: a row in `CITY_PROFILES`, industries in `industry-neighbors.ts`, entities in `seed/seed.json`, events at `/events/new`, then deploy |
| N4 | Importable Dify DSL | `dify/brief-review.yml` and `team-review.yml`, ready to import |
| N5 | Docs | architecture, deploy, operator guide, ElevenLabs agents, demo script |
| N6 | Public pages run without keys locally | Embedded PGlite with seeded demo data; without Clerk keys sign-in is off and protected pages explain setup (no Clerk keyless mode). Labelled fallbacks in dev |

---

## 2. Prioritization

Scores are 0–3 for each criterion. **Wow** = how it looks on camera. **Risk** = chance it fails live (3 = high). Priority = H+T+D+O+Wow−Risk.

| Feature | H | T | D | O | Wow | Risk | Pri | Tier |
|---|---|---|---|---|---|---|---|---|
| B1 Voice interview (ElevenLabs) | 3 | 3 | 3 | 1 | 3 | 2 | 11 | **Must** |
| C1+C2 Official-source grounding cascade (Linkup) | 3 | 3 | 3 | 2 | 2 | 1 | 12 | **Must** |
| D1+D2 Dify 7-step review + PII scrub | 2 | 3 | 3 | 3 | 2 | 1 | 12 | **Must** |
| D4/E1 Host approves (one code path, audit log) | 3 | 2 | 3 | 1 | 1 | 1 | 9 | **Must** |
| H1–H4 Grants auto-matched (jGrants + municipal + 行政書士) | 3 | 3 | 3 | 2 | 2 | 0 | 13 | **Must** |
| I1–I4 Events + RSVP + waitlist | 3 | 2 | 3 | 2 | 2 | 0 | 12 | **Must** |
| A1 8-bit hero (EN + JA) | 2 | 0 | 3 | 1 | 3 | 0 | 9 | **Must** (hook) |
| G1–G4 Impact link + hours saved | 3 | 2 | 3 | 1 | 2 | 1 | 10 | **Must** |
| C4 Adaption synthetic data | 2 | 3 | 2 | 2 | 1 | 1 | 9 | **Must** (badge on the grounding shot) |
| F1/F4 One named lead + 90-day support | 3 | 2 | 2 | 1 | 1 | 0 | 9 | **Must** (one beat) |
| N1/N3 MIT + add your town | 2 | 0 | 2 | 3 | 1 | 0 | 8 | **Must** (close) |
| E4/J Neo4j graph | 2 | 3 | 2 | 2 | 3 | 2 | 10 | Nice |
| A2 Search suggestions "snow" | 2 | 1 | 2 | 0 | 2 | 0 | 7 | Nice |
| A3 Challenge marquee | 2 | 0 | 2 | 0 | 2 | 0 | 6 | Nice |
| K2 Kitchen quest | 1 | 0 | 3 | 0 | 3 | 0 | 7 | Nice (insight beat) |
| L1 AI-teammates party builder | 2 | 0 | 2 | 0 | 3 | 0 | 7 | Nice (roadmap, ≤6 s) |
| G3 Voice impact review | 2 | 3 | 2 | 0 | 2 | 2 | 7 | Nice |
| E3 Service status strip | 0 | 3 | 1 | 2 | 1 | 1 | 6 | Nice (B-roll, proves the AI is real) |
| K3 Formats harness | 1 | 0 | 2 | 0 | 2 | 0 | 5 | Mention |
| D3 Dify team review | 1 | 2 | 1 | 1 | 0 | 1 | 4 | Mention |
| F2 Lead transfer | 1 | 1 | 0 | 0 | 0 | 0 | 2 | Mention |
| I5 ICS / share | 1 | 1 | 1 | 0 | 0 | 0 | 3 | Mention |
| M1 i18n EN/JA | 3 | 1 | 2 | 2 | 1 | 0 | 9 | Mention (shown via the JA hero cut) |
| M2 Live-only mode | 0 | 3 | 2 | 1 | 0 | 0 | 6 | Mention (writeup) |
| M3–M8 Tests / evals / CI / audit / Impeccable | 0 | 3 | 1 | 3 | 0 | 0 | 7 | Mention (deck slide 8, writeup) |
| L2/L3 Virtual PM, points | 1 | 0 | 1 | 0 | 1 | 0 | 3 | Mention |
| B6 simulate:interview, prebake, scripts | 0 | 2 | 0 | 2 | 0 | 0 | 4 | Mention (writeup) |
| A5 "Most local ideas stall" | 3 | 0 | 3 | 0 | 1 | 0 | 7 | Nice (problem beat) |
| B3/B4 Me / onboarding | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Skip |
| K4 404 / mascot | 0 | 0 | 0 | 0 | 1 | 0 | 1 | Skip |

### (a) Tiers

- **Must show:**
  1. Hero (EN, with a cut to JA)
  2. ElevenLabs voice interview
  3. Linkup official-source grounding cascade, with Adaption synthetic badge
  4. Dify 7-step review with deterministic PII scrub
  5. Host approves (audit log)
  6. Grants auto-matched (jGrants + municipal + Grantline + 行政書士)
  7. Events list, event detail and RSVP/waitlist
  8. Team with one named lead and 90-day support
  9. Impact link and hours saved per week
  10. MIT, any town can fork it
- **Nice to show:** Neo4j graph · search "snow" · challenge marquee · kitchen quest · AI-teammates party builder · voice impact review · service-status strip.
- **Mention only:** formats harness · Dify team review · lead transfer · ICS/share · i18n · live-only mode · tests/evals/CI/orphan audit/Impeccable · virtual PM / points · CLI scripts.
- **Skip on video:** me/onboarding · 404.

### (b) 3-minute shot list

Prep: sign in as host in one window (`/en/admin`) and as a business owner in another (`/en/interview`). Keep shot files open as fallbacks. VO ≤ 15 words each.

| Time | Shot (screen / route) | On-screen action | Voiceover (≤15 words) | Partner tags visible |
|---|---|---|---|---|
| 0:00–0:08 | **Hook.** PixVerse snow clip → `/en` hero (shot 01) | Snow falls; the shoveller clears the path to the lit hall | "In Hokkaido, someone shovels the path before anyone else gets through." | (PixVerse) |
| 0:08–0:20 | **Problem.** `/en#why` "Most local ideas stall before anyone builds." (shot 20) → challenge marquee (shot 04), "22 h/week lost" chip zoom | Line reveals; cards scroll; zoom on the hours-lost chip | "Fewer hands, same town. Small shops lose whole mornings to phones and paperwork." | — |
| 0:20–0:30 | **Insight.** Kitchen quest step 1→2 (shot 05) | Click step 2, "Prototype in days" types out | "Builders aren't the bottleneck. The prep is. That's what Yukikaki does." | — |
| 0:30–0:55 | **Voice interview.** `/en/interview` (**record live, signed in as owner**) | Start the voice session, owner answers two questions in Japanese, end | "An owner just talks for ten minutes. ElevenLabs turns it into a structured brief." | **ElevenLabs** |
| 0:55–1:15 | **Grounded brief.** Snow-removal challenge detail → Data & grounding (shots 08, 09) | Scroll over the Live source cards (Sapporo 社協, city pages); hover the 合成/Synthetic badge | "Linkup grounds it in official sources only. Adaption makes safe stand-in data." | **Linkup, Adaption Labs** |
| 1:15–1:35 | **AI review + PII scrub.** `/en/admin` brief card (**host sign-in**) + Dify canvas B-roll | Show the AI score, issues and "PII scrubbed → revise"; pan the 7 Dify nodes | "Dify reviews in seven steps. Personal data is scrubbed by code, not guessed." | **Dify** |
| 1:35–1:43 | **Host approves.** `/en/admin` | Type a note, click Approve; the status flips | "AI only recommends. A human host approves, and every decision is logged." | **Neon** (status strip) |
| 1:43–2:03 | **Grants auto-matched.** Challenge grants (shot 10) → `/en/grants` (shot 11) | jGrants cards with days left; municipal 除雪 programme; 行政書士 notice; Grantline link | "Approval auto-matches open grants from jGrants and city sites, with a Grantline hand-off." | (jGrants, Linkup) |
| 2:03–2:20 | **Event + RSVP.** `/en/events` (shot 12) → Sapporo Snow-Tech Hackathon (shot 13) | Filter Format=Hackathon, open the event, click RSVP; show the Setagaya "Full · 2 on waitlist" | "Then it's Luma for hackathons: RSVP, waitlist, calendar, and the challenges attached." | **Neon** |
| 2:20–2:30 | **Team / lead.** `/en/teams/<id>` or admin Teams tab (**sign-in**); optional Neo4j graph cut | Point at the Lead badge; flash the graph | "One named lead per team, who supports the owner for ninety days." | **Neo4j**, Dify (team review) |
| 2:30–2:43 | **Impact + hours saved.** Admin Deliveries → Send impact check → `/feedback/<token>` → Impact tab; testimonial (shot 15) | Send the link, show the form/voice option, then the hours total | "The owner reports back, by form or voice. Fourteen hours a week, given back." | **ElevenLabs**, Resend |
| 2:43–2:51 | **Coming soon.** "What's coming next" cards (shot 21) → party builder with Students + Shop owner (shot 16) | Toggle a human; robots fill the remaining roles | "Next: bring any team, and AI teammates fill the missing roles." | — |
| 2:51–3:00 | **Open repo / any town.** GitHub README → `/ja` hero (shot 02) → logo | Scroll README "Run it in your town"; cut to the JA hero | "MIT-licensed. Fork it for your town. Yukikaki: your test kitchen for ideas." | all six logos on the end card |

Fallbacks: if voice fails, use the text form ("Owners can also type."). If a live call fails, the brief shows an issue: say so; don't fake it.

### (c) 10-slide deck

| # | Slide | Headline | Bullets | Visual |
|---|---|---|---|---|
| 1 | Title | **Yukikaki 雪かき: your test kitchen for ideas and prototypes** | • AI-native hackathons for Sapporo and beyond · • Team Snowball, Category B "Fewer hands, same town" | Shot 01 hero (or a Hyper3D Rodin 3D snow hall) |
| 2 | Problem | **Fewer hands, same town** | • A Sapporo snow-removal firm loses 22 h a week to phone and LINE intake · • Owners can't hire, and they rarely meet the builders who could help | Shot 04 marquee crop, "h/week lost" chips |
| 3 | Insight | **Builders aren't the bottleneck. The prep is.** | • Most local ideas stall before anyone builds: problem, data, nemawashi, venue, funding · • That's the yukikaki: necessary work nobody wants | Shot 20 "Most local ideas stall" + shot 05 kitchen quest |
| 4 | Solution | **Peatix or Luma for hackathons, with the prep done and the funding found** | • Voice interview → grounded, reviewed challenge → event → team → impact · • Same prep, any format: hackathon, design charrette, test kitchen | Shot 06 formats harness |
| 5 | How it works | **One pipeline, six partners, one guard** | • ElevenLabs → Linkup → Adaption → Dify → host → Neo4j/jGrants → Resend · • Neon is the source of truth; every call is logged | README mermaid diagram (redrawn) |
| 6 | Live demo | **From a phone call to a challenge in minutes** | • Official sources only, synthetic stand-in data, PII scrubbed by code · • Host-only approval with an audit log | Shots 08–09 + admin card (record) |
| 7 | Grants | **Funding found automatically** | • jGrants (Digital Agency) and municipal programmes matched on approval · • Grantline hand-off; 行政書士 notice | Shot 10 / 11 |
| 8 | Tech & partners | **Real AI, not a mock** | • Live-only mode: nothing faked. 7-step + 6-step Dify flows; evals; CI; a11y · • ElevenLabs · Linkup · Neo4j · Dify · Neon · Adaption Labs | Logo grid + service-status strip |
| 9 | Impact & roadmap | **Measured in hours given back** | • Single-use impact link, voice review, hours/week total; 90-day lead support · • Next: AI teammates, a virtual PM, points & rewards | Shot 15 testimonial + shot 16 party builder |
| 10 | Ask / close | **Every town deserves a test kitchen** | • MIT: fork it, add your city profile, run it · • Ask: a pilot ward, local hosts and venues for winter 2027 | Shot 02 JA hero + repo QR (Cascadeur animated mascot optional) |

---

## 3. Snapshots

Folder: `~/.hermes/cache/scratch/yk-demo/shots/`. Desktop shots are 1440×900; mobile shots are 390×844 at @2x. All from the live site with no sign-in, taken with the repo's Playwright Chromium. (The shared browser window was capped at 1512×770, so it could not produce exact 1440×900.) Retake scripts: `~/.hermes/cache/scratch/yk-demo/pw/shots.js` (all shots; its CLI filter uses the original step keys, so run it with no args to retake everything) and `pw/extra.js` (shots 20, 21). Shots 20–21 were added after the re-deploy and are numbered last; their timeline slots are noted in the table.

| File | Shows |
|---|---|
| 01-hero-en.png | `/en` hero with "Bring any team" teaser and the floating owner quote |
| 02-hero-ja.png | `/ja` hero: アイデアと試作のための、テストキッチン。 |
| 03-search-snow.png | Hero search typed "snow", showing the snow-removal suggestion (Evaluated, 22 h/week lost) |
| 04-challenge-marquee.png | "Challenges waiting for builders" marquee |
| 05-kitchen-quest.png | Kitchen quest, step 2 of 4 "Prototype in days" |
| 06-formats-charrette.png | Formats harness with Design charrette selected |
| 07-challenges.png | `/en/challenges` board (5 published) |
| 08-challenge-detail.png | Snow-removal challenge: Problem / Today / Goal |
| 09-challenge-sources.png | Data & grounding: Live official sources (札幌市社会福祉協議会, 札幌市) |
| 10-challenge-grants.png | Grants & subsidies: jGrants + municipal 除雪 programmes + Grantline |
| 11-grants.png | `/en/grants` with the 行政書士 notice and matched programmes |
| 12-events-list.png | `/en/events`: 3 demo events (charrette, hackathon, test kitchen "Full · 2 on waitlist") |
| 13-event-detail.png | Sapporo Snow-Tech Hackathon: 8/40 going, RSVP, calendar, share |
| 14-event-challenges-grants.png | Same event: linked challenges and grants for the event's projects |
| 15-testimonials.png | "What owners said after delivery" (14 h/week saved), with the top of "What's coming next" below |
| 16-party-builder.png | AI-teammates party builder: Students + Shop owner selected, 4 helper robots |
| 17-sign-in.png | Clerk sign-in page (note: shows a "Development mode" ribbon) |
| 18-mobile-hero.png | Mobile hero, 390×844 |
| 19-mobile-event.png | Mobile event page, 390×844 |
| 20-why-problem.png | `/en#why` "Most local ideas stall before anyone builds." (problem beat, 0:08) |
| 21-roadmap-cards.png | `/en#roadmap` "What's coming next": 3 COMING SOON cards (coming-soon beat, 2:43) |

**Record live while signed in as host** (they redirect to `/sign-in` when signed out; checked): `/en/admin` (queue, AI review, PII line, approve, service strip, Teams / Deliveries / Impact tabs), `/en/admin/graph` (Neo4j), `/en/events/new` (host create). **Record while signed in as owner:** `/en/interview` (voice + text). Token page `/en/feedback/<token>`: generate via admin "Send impact check" (Copy button).

### Seeded data to use (`seed/seed.json`, `scripts/seed-events.ts`)

| Use for | Record | Notes |
|---|---|---|
| Hero problem, grounding, grants, impact | **Sapporo snow-removal**: ゆきもり除雪サービス (東区), "Automate snow-removal request intake and dispatch", `sapporo-snow-dispatch`, status *evaluated*, 22 h/week lost, 14 h/week saved quote | Live URL `/en/challenges/6da391ff-f569-44b6-810e-2f522a0d4fc2` |
| Delivered → impact check | 麺処 ほしぞら (Sapporo 中央区), LINE reservation replies, *delivered* | `/en/challenges/48c7a66d-6860-4162-ae29-a35acc801dbc` |
| Open challenge outside Hokkaido (any town) | **Setagaya bakery**: ベーカリー こむぎの木, demand forecast + ingredient ordering, *approved* | `/en/challenges/2786f5c1-bde4-40f5-87a0-6f3b8160f6b2` |
| Subsidy-heavy | 森野ファーム (Asahikawa, *in_progress*), 運河の宿 しおかぜ (Otaru, *approved*) | f95460ec…, c2e1e428… |
| Admin queue (AI review) | 京小物 はんなり堂 (Kyoto, *in_review*), ほしみ酒造 (Kanazawa, *in_review*) | host only. *A fresh Sapporo interview gives the best cascade shot* |
| Rejected / resubmit | デイサービス りんごの里 (Aomori, *rejected*) | host only |
| **3 demo events** | ① Otaru Guesthouse Design Charrette, 12 Dec 2026, 小樽市立図書館, cap 20 · ② **Sapporo Snow-Tech Hackathon**, 30–31 Jan 2027, 札幌市中央図書館, 8/40 · ③ Setagaya Small-Shop Test Kitchen, 20 Feb 2027, 世田谷区立中央図書館, cap 8, **full + 2 waitlisted** (waitlist promotion demo) | slugs `otaru-guesthouse-design-charrette`, `sapporo-snow-tech-hackathon-2027`, `setagaya-small-shop-test-kitchen` |
| Graph | 21 entities (stakeholders, venues, funders), 23 users, 6 teams, 2 deliveries, 1 evaluation | `pnpm graph:rebuild` before recording |

### Risks noticed on the live site

- The sign-in page shows Clerk's **"Development mode"** ribbon. Switch to a production Clerk instance before recording, or crop it.
- The landing counter says 14 h/w saved, while the snow card says 22 h/week lost. Both are correct (lost before vs saved after). Say "lost" and "given back" clearly in the VO.
- Testimonial and event cards are labelled "Demo data / Demo event". Keep the labels visible; that's honest and judges will see it.
