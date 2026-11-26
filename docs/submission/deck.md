# Yukikaki 雪かき — Deck text (12 slides)

Format per slide: **headline**, 2–3 bullets, speaker notes (≤40 words) and a suggested visual.
Screenshots: `docs/screenshots/*` (in repo) and `~/.hermes/cache/scratch/yk-demo/shots/*` (local capture set, not committed; copy what you use into the deck file). Video and deck assets were made with PixVerse (clips), Hyper3D Rodin (3D models) and Cascadeur (animation).
Rule: anything on a "coming soon" slide must stay labelled as coming soon. Seeded businesses are demo data.

---

## 1. Yukikaki 雪かき — AI-native hackathons for Sapporo and beyond

- Like Peatix or Luma, for hackathons, with the prep done and the funding found
- *Nemawashi done. Mise en place ready.*
- Team Snowball · Category B: "Fewer hands, same town"

**Notes:** In a Hokkaido winter, someone shovels the path before anyone else can get through. That's yukikaki. We do that work for the people who build.
**Visual:** Hero, 8-bit snowy night with a shoveller clearing the path to a lit hall. `docs/screenshots/hero-en-desktop.jpg` (or `01-hero-en.png`). Optional PixVerse clip of falling snow.

## 2. Fewer hands, same town

- Hokkaido shops lose hours a week to phone bookings, dispatch calls and paperwork
- Builders who could automate it exist, but they never meet a real owner with a ready problem
- The missing piece is the prep: problem, data, buy-in, venue, funding, a team that stays

**Notes:** Builders aren't the bottleneck. A clear problem, safe data, nemawashi, a venue and funding are. Nobody does that work, so the hackathon never starts well.
**Visual:** Rodin 3D model of a snowed-in shopfront. Labels: "phone", "paper", "snow dispatch".

## 3. Your test kitchen for ideas and prototypes

- AI agents do the legwork: interview, research, data, review, matching, grants
- People make every call: the host approves, the owner judges impact
- One harness for three formats: hackathon, design charrette, test kitchen

**Notes:** AI-native means agents prep every step and humans decide. Bring a problem, prototype it, try it in a real week, then keep, rework or drop.
**Visual:** Landing "test kitchen" quest (`05-kitchen-quest.png`) next to the formats explorer (`06-formats-charrette.png`).

## 4. A ten-minute voice interview becomes a brief

- An ElevenLabs agent interviews the owner in Japanese or English (a text form is the fallback)
- Its data-collection fields become a bilingual brief: problem, process, hours lost, data sensitivity
- Idempotent on conversation ID via a signed webhook or polling

**Notes:** The owner just talks. ElevenLabs pulls out structured fields, and we get a draft challenge in both languages without anyone typing a form.
**Visual:** Screen recording of `/en/interview` (voice session). Cascadeur-animated mascot "listening".

## 5. Cite it or say you can't

- Linkup searches official domains only: go.jp, lg.jp, or.jp, ac.jp and the city site
- The cascade runs exact city → analog cities (Sapporo → Asahikawa, Aomori, Nagano) → national → ungrounded
- Every source is stored with its URL; blogs and other cities' sites are rejected

**Notes:** No Sapporo data? We look for towns with the same snow, winters, size and ageing. If nothing official turns up, the brief says so.
**Visual:** Challenge sources panel `12b-challenge-sources.png`. Small map: Sapporo linked to its analog cities.

## 6. Safe data, human decisions

- Adaption Labs generates fictional Japanese stand-in rows only from grounding facts
- Dify pre-reviews privacy, feasibility, grounding and bilingual quality, and scrubs verified PII
- Only a host approves, via one audited path (`decide()`)

**Notes:** No grounding, no synthetic data: the code throws. Dify recommends, and if PII is found it forces "revise". A person presses approve, and it's logged.
**Visual:** `/admin` brief card with AI badge, issues and Approve button (capture live), plus `12-challenge-detail.png`.

## 7. The funding found, legally

- On approval, open programmes are matched from the official jGrants API (Digital Agency)
- Shows deadline, amount and rate, with a hand-off to Grantline for eligibility
- 行政書士 notice everywhere: we discover and match; licensed scriveners file

**Notes:** Since January 2026, paid grant-application prep is reserved to 行政書士. We find the money and hand off. We never draft applications.
**Visual:** `14-grants.png` and `12c-challenge-grants.png` with the notice banner highlighted.

## 8. Events, teams and the town graph

- Events with RSVP, capacity, waitlist auto-promotion, `.ics` export and per-event grant matches
- Neo4j links challenges to cities, data, skills, stakeholders, venues and funders, and suggests builders
- One named lead per team, enforced by the database

**Notes:** It feels like Luma, but every event arrives with prepped challenges and funding leads. Neo4j shows who in town should be in the room.
**Visual:** `09-events-list.png`, `10b-event-detail-challenges-grants.png`, and the force graph from `/admin/graph`.

## 9. Hours saved per week, measured by owners

- The lead delivers and stays on as support contact for 90 days
- Single-use, 14-day impact link: a form or a voice review (second ElevenLabs agent)
- `/admin` Impact tab totals hours saved per week

**Notes:** This is the number a town council cares about. It comes from owners, not from us. Testimonials on the landing page are real quotes; seeded ones carry a demo label.
**Visual:** Admin Impact tab (capture live) and `08-testimonials.png`.

## 10. Real AI, honestly labelled

- Six partners doing real work: ElevenLabs, Linkup, Adaption Labs, Dify, Neo4j, Neon
- Live-only mode: a failed call shows up as an issue and is never swapped for canned data
- Evals published as-is: 16 of 20 metrics pass, and we show the 4 that fail

**Notes:** Seeded businesses are demo data, made by running the real pipeline. We publish our failing evals too. Grant relevance and grounding precision are the next fixes.
**Visual:** Architecture flow (README mermaid) with partner logos, and a crop of `evals/results/2026-11-26-summary.md`.

## 11. Fork it for your town

- MIT-licensed on GitHub, bilingual EN/JA, deployed on Vercel in Tokyo
- New town = one row in `city-profiles.ts`, your entities in `seed.json`, then deploy
- Dify DSL import, `pnpm setup:elevenlabs`, `pnpm check:services`; CI with tests and axe a11y checks

**Notes:** Any Hokkaido town can run this with its own hosts, data and partners. The repo explains every step.
**Visual:** `docs/screenshots/landing-ja-mobile.jpg` (or `16-mobile-hero.png`) beside the GitHub repo page and an MIT badge.

## 12. Coming soon, and the ask

- **Coming soon:** "Bring any team" AI helpers, a virtual product manager, points and rewards (waitlist open)
- Next: better grant and grounding precision, more Hokkaido city profiles
- Ask: towns, hosts and shops who want to run the first test kitchen

**Notes:** These features aren't live yet; the landing preview runs in the browser only. Today you can run a prepped hackathon. Join us to shovel the next path.
**Visual:** Party builder preview `07-party-builder.png` with a "Coming soon" stamp. End card: URL and QR code to project-yukikaki.vercel.app.
