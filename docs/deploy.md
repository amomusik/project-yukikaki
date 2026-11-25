# Deploying to Vercel

## Why Vercel

- **Native Next.js.** The app is Next.js 15 App Router; Vercel builds it with no extra configuration.
- **Integrations.** Neon and Clerk both have Vercel Marketplace integrations that create the account and set the environment variables for you.
- **`after()` support.** Long work (the brief pipeline, team reviews) can run after the response is sent, so owners are not kept waiting while Linkup, Adaption Labs and Dify are called.
- **Preview deployments** per pull request — handy when several towns contribute to a fork.

Any Node.js host that runs `next build && next start` will also work; you then need your own Postgres (Neon works anywhere) and a way to keep long requests alive.

## 1. Import the repository

1. Push your fork to GitHub.
2. In Vercel: **Add New… → Project → Import** your repository.
3. Framework preset: **Next.js** (detected). Install command: `pnpm install`. Build command: `pnpm build`. Leave the output directory as default.
4. Don't deploy yet — add the database and environment variables first.

## 2. Database: Neon

1. In the Vercel project: **Storage → Create / Connect Database → Neon** (Marketplace integration). This creates a Neon project and adds `DATABASE_URL` (and related variables) to the project.
   - Or create a database at <https://console.neon.tech> and paste its connection string into `DATABASE_URL` yourself.
   - Either way, pick region **aws-ap-southeast-1** (Singapore) — the closest Neon region to Japan. The function region is already set to `hnd1` (Tokyo) in `vercel.json`.
   - `DATABASE_URL` is required on Vercel: the local PGlite fallback is excluded from the deployment and refuses to start there (read-only filesystem).
2. Apply the schema from your machine against Neon:

   ```bash
   DATABASE_URL="postgres://…neon.tech/…?sslmode=require" pnpm db:push
   ```

   (or put the URL in `.env.local` temporarily and run `pnpm db:push`). It prints `✓ migrations applied (neon)`.
3. Optional — load the demo content (seed briefs plus the `seed/prebaked` demo seed data):

   ```bash
   DATABASE_URL="…" pnpm seed
   ```

   Skip this for a real town launch, or edit the seed file first.

## 3. Environment variables

In **Settings → Environment Variables** (Production, and Preview if you use it). The full list is in `.env.example`.

| Variable | Value |
|---|---|
| `APP_URL` | Your public URL, e.g. `https://yukikaki.example.jp` (used in impact links and emails) |
| `HOST_EMAILS` | Comma-separated host emails |
| `REQUIRE_LIVE_SERVICES` | `true` — live-only mode: failed calls are reported on the brief, never replaced with pre-baked data |
| `FEEDBACK_TOKEN_SECRET` | `openssl rand -hex 32` — **required in production** (signs impact-check links) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | From your Clerk **production** instance (step 6) |
| `DATABASE_URL` | Set by the Neon integration |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | Neo4j AuraDB Free URI + the username/password from its credentials screen (step 4) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_INTERVIEW_AGENT_ID`, `ELEVENLABS_IMPACT_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET` | Agent IDs come from `pnpm setup:elevenlabs` (copy them from `.env.local`); see [elevenlabs-agents.md](elevenlabs-agents.md) |
| `LINKUP_API_KEY` | From Linkup |
| `DIFY_API_URL`, `DIFY_BRIEF_REVIEW_KEY`, `DIFY_TEAM_REVIEW_KEY` | `https://api.dify.ai` for Dify Cloud (or your self-hosted URL) + the API keys of the two apps imported from `pnpm dify:build` output (verify with `pnpm smoke:dify`) |
| `ADAPTION_API_KEY` (`ADAPTION_API_URL`) | From Adaption Labs |
| `RESEND_API_KEY`, `EMAIL_FROM` | From Resend; `EMAIL_FROM` must use your verified domain (step 7) |

To copy them from your `.env.local` with the Vercel CLI instead of pasting by hand:

```bash
vercel link                                            # once, in the repo
pnpm vercel:env --app-url https://yukikaki.example.jp  # add --env preview for Preview
sh ~/.hermes/cache/scratch/vercel-env.sh && rm ~/.hermes/cache/scratch/vercel-env.sh
```

`pnpm vercel:env` writes a mode-600 shell script of `vercel env add NAME production` commands (each value piped on stdin, replacing any existing value) and prints only the variable names — never the values. `--app-url` overrides `APP_URL`; `--out <path>` changes the script location. It warns about empty variables, Clerk test keys and the Resend test sender. Delete the script after running it.

Every variable is required — there are no optional services. Deploy, then check from your machine with the same variables: `pnpm check:services` must show ✓ for all 8 services (it exits non-zero otherwise).

## 4. Neo4j

1. In the Aura console at <https://console.neo4j.io>, choose **Create instance → Free** ($0). No API key is involved.
2. The credentials screen shows the password **only once** — copy it (or download the credentials file) before closing it.
3. Set:
   - `NEO4J_URI` = `neo4j+s://<instance-id>.databases.neo4j.io`
   - `NEO4J_USERNAME` = the username shown on the credentials screen (on current Aura Free this is the instance id, not `neo4j`)
   - `NEO4J_PASSWORD` = the password from that screen
4. After seeding (or any time the graph looks out of date), run from your machine:

   ```bash
   DATABASE_URL="…" NEO4J_URI="neo4j+s://<instance-id>.databases.neo4j.io" NEO4J_USERNAME="<username>" NEO4J_PASSWORD="…" pnpm graph:rebuild
   ```

An Aura Free instance pauses after a few days without activity — resume it from the Aura console. If it stays paused for 30 days it is deleted; Neon stays the source of truth, so create a new Free instance, update the three variables and run `pnpm graph:rebuild` to restore the graph.

## 5. ElevenLabs webhook

After the first deploy, set the post-call webhook URL in ElevenLabs to:

```
https://<your-domain>/api/webhooks/elevenlabs
```

Copy the webhook secret into `ELEVENLABS_WEBHOOK_SECRET` and redeploy. Full steps: [elevenlabs-agents.md](elevenlabs-agents.md#5-post-call-webhook-production).

## 6. Clerk production instance

1. In the Clerk dashboard, create a **production** instance for your application (development instances are for local use only; for local dev you can create the app with the Clerk CLI: `clerk apps create`, then `clerk env pull`).
2. Add your domain and create the DNS records Clerk shows you.
3. Configure the sign-in methods you want (email code, Google, LINE if available, etc.).
4. Copy the production `pk_live_…` / `sk_live_…` keys into Vercel.

## 7. Resend domain

1. In Resend, **Domains → Add domain** and use a subdomain (e.g. `mail.yukikaki.example.jp`).
2. Add the DNS records it shows for that subdomain: the **DKIM** `TXT` record, the **SPF** `MX` and `TXT` records, and the `CNAME` record.
3. Wait until the domain is **Verified**.
4. Set `EMAIL_FROM`, e.g. `Yukikaki <noreply@mail.yukikaki.example.jp>`, and `RESEND_API_KEY`.

A verified domain is required. The test sender `onboarding@resend.dev` only delivers to the Resend account owner's own address, so it cannot reach business owners. If a send fails, the host sees the link in `/admin` with a Copy button.

## 8. Function duration (maxDuration)

Some routes do slow work and need more than the default function timeout:

| Work | Why it is slow |
|---|---|
| Brief pipeline (after an interview: `/api/interviews/complete`, `/api/webhooks/elevenlabs`, text-form submission) | Linkup cascade (up to 3 rounds of searches, 20 s timeout each), Adaption Labs (waits ~25 s for rows, ~45 s guard), Dify review (60 s timeout) |
| Local interview completion | Polls ElevenLabs for up to ~90 s until analysis is `done` |
| Team creation | Dify team review (60 s timeout) |

`vercel.json` pins functions to **`hnd1` (Tokyo)** (Hobby allows one region). Each slow route sets `export const maxDuration = 300` in its file: `/api/interviews/complete`, `/api/webhooks/elevenlabs`, and the pages whose server actions start work with `after()` (`/interview`, `/admin`, `/admin/graph`, `/feedback/[token]`, `/teams/new`, `/teams/[id]`, `/teams/[id]/deliver` — a server action runs in its page's function). With Fluid Compute (on by default) 300 s is the **Hobby maximum**; **Pro** allows up to 800 s if you raise it. Long work can be started with `after()` so the response returns immediately; `after()` work still counts against the function's `maxDuration`. Check your plan's limits — Vercel's maximums differ by plan and by whether Fluid Compute is enabled. If a function is cut off, the brief may stay in `enriching`; the pipeline is idempotent and can be re-run for that brief.

## 9. After deploy checklist

- [ ] Sign in with a `HOST_EMAILS` address and open `/ja/admin`.
- [ ] `pnpm check:services` exits 0 (all 8 services live) and the service status strip is green.
- [ ] Do a short voice interview; the brief reaches the admin queue.
- [ ] The ElevenLabs conversation shows a successful webhook delivery.
- [ ] Send a test impact check to a non-owner address; the email arrives from your verified domain.
- [ ] `pnpm graph:rebuild` succeeds and the challenge page shows the graph.
