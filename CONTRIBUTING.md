# Contributing to Yukikaki

Thanks for helping. Contributions from any town are welcome: bug fixes, translations, city profiles and new features.

## Dev setup

Requires Node.js 22 and pnpm (the version pinned in `.github/workflows/ci.yml`).

```bash
git clone https://github.com/amomusik/project-yukikaki.git
cd project-yukikaki
pnpm install
cp .env.example .env.local   # empty values = browse public pages only; add your own keys for the rest
pnpm dev
```

Insert your own production keys into your .env.local variables — Yukikaki does not use Clerk keyless dev mode.

With every value empty, run `pnpm db:push && pnpm seed` first: the app then uses embedded PGlite (`./.data/pglite`) and you can browse the public pages (challenges, events, grants) on seeded demo data. Sign-in is off without both Clerk keys (protected pages explain what to set), and every live feature needs its real key. With `REQUIRE_LIVE_SERVICES` off, missing partner services use the labelled fallbacks in [docs/architecture.md](docs/architecture.md); live-only mode (`REQUIRE_LIVE_SERVICES=true`) is for production. See the README [Quick start](README.md#quick-start) for the full setup.

## Before you open a PR

These must pass. CI runs the same checks:

```bash
pnpm typecheck
pnpm lint
pnpm test            # unit + integration + contract (Vitest)
pnpm drizzle-kit check
```

- **Add or update tests** for any behaviour change. Pure logic goes in `tests/unit`, anything that touches the database in `tests/integration` (PGlite with the real schema), and partner API shapes in `tests/contract` with fixtures in `tests/fixtures/`.
- **Schema changes:** edit `lib/db/schema.ts` and run `pnpm db:generate`, then commit the migration in `drizzle/`.
- `pnpm knip` and `pnpm audit:orphans` only warn for now, but please don't add new findings.
- Live evals (`pnpm evals`) cost partner credits and are run manually. You don't need to run them.

## Every UI string in English and Japanese

No hard-coded user-facing text. Add each key to **both** `messages/en.json` and `messages/ja.json` in the same PR. Japanese is the default locale. If you can't write natural Japanese, add your best attempt and say so in the PR so a native speaker can review it.

## Design & UX review

[DESIGN.md](DESIGN.md) is the design source of truth: palette tokens, type scale, motion and pixel-art rules, voice and fixed terms (challenge, owner, builder, host), accessibility targets (WCAG 2.2 AA) and do's and don'ts. Impeccable reads it, so its checks follow our system.

- **Before every PR that touches UI:** run `pnpm design:check` (static scan of `app/` and `components/`) and fix new findings or explain them in the PR. CI runs the same scan as a non-blocking job and uploads the report as the `impeccable-design-report` artifact.
- **Rendered check:** `pnpm design:check:live` scans the production site; `DESIGN_URL=http://127.0.0.1:3100 pnpm design:check:live` scans your dev server. Add `DESIGN_VIEWPORT=390x844` or `DESIGN_SCHEME=dark` for the other passes.
- **When the brand changes** (palette, type, hero, voice, terms), update DESIGN.md in the same PR.
- **Monthly review:** once a month, walk the key journeys (owner brings a problem, builder finds and joins an event, host reviews, visitor checks grants) at 1440×900 and 390×844, light and dark, EN and JA. Review with the Impeccable agents in `.github/agents/`: `impeccable-finish-reviewer` for the finished surfaces and `impeccable-motion-reviewer` for motion and reduced motion. Record findings, fixed vs open, in `docs/design/review-<date>.md` (see the latest one for the format).

## No secrets, no personal data

- Never commit `.env.local`, API keys, tokens or real interview recordings or transcripts. `.env*` is git-ignored except `.env.example`.
- If you add an env var, add it to `.env.example` with an empty value and document it in the README.
- Don't print secret values in logs, scripts or test output.
- Use synthetic or fictional data in fixtures and seeds. See [SECURITY.md](SECURITY.md).

## PR conventions

- Branch from `main`. Keep each PR focused on one change.
- Write commit messages and PR titles in the imperative ("Add waitlist promotion email").
- In the PR description, say what changed and why, how you tested it, and include screenshots (en and ja) for UI changes.
- CI must be green before merge.
- By contributing you agree your work is released under the [MIT License](LICENSE).
