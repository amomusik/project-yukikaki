# Contributing to Yukikaki

Thanks for helping. Contributions from any town are welcome: bug fixes, translations, city profiles and new features.

## Dev setup

Requires Node.js 22 and pnpm (the version pinned in `.github/workflows/ci.yml`).

```bash
git clone https://github.com/amomusik/project-yukikaki.git
cd project-yukikaki
pnpm install
cp .env.example .env.local   # leave values empty to use local fallbacks
pnpm dev
```

Without `DATABASE_URL` the app uses embedded PGlite (`./.data/pglite`). Without Clerk keys it runs in Clerk's keyless dev mode. Partner services fall back as described in [docs/architecture.md](docs/architecture.md). See the README [Quick start](README.md#quick-start) for the full setup.

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
