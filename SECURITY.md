# Security policy

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately with GitHub's [private vulnerability reporting](https://github.com/amomusik/project-yukikaki/security/advisories/new) (Security tab → "Report a vulnerability").

Include the affected route or file, steps to reproduce and the impact. We aim to reply within 7 days. Only the latest `main` is supported.

## Secret handling

- All credentials live in environment variables: `.env.local` locally, and the hosting provider's encrypted env settings or GitHub Actions secrets in deployment. `.env*` is git-ignored, and only `.env.example` (with empty values) is committed.
- Scripts and the orphan audit never print `.env.local` values.
- CI runs hermetically with no partner keys. Jobs that need secrets skip themselves when the secrets are absent.
- If a key is ever committed or leaked, rotate it at the provider right away, then report it as above.
- One-time impact-check tokens are signed with `FEEDBACK_TOKEN_SECRET` and stored only as HMAC hashes.

## Personal data (PII) policy

Business owners share real problems in voice or text interviews, so:

1. **Dify scrub.** Every brief goes through the Dify pre-review workflow (`dify/brief-review.yml`) before it can be published. A privacy step flags personal data, and values that literally appear in the input (plus romanised forms of names) are scrubbed from the brief text and issues. If PII is found, the recommendation is forced to "revise".
2. **The host approves every output.** AI only recommends. Nothing is published until a town host approves it through a single host-only code path (`lib/decide.ts`), which writes an audit log.
3. **Builders never see private data.** They work on synthetic, fictional stand-in data generated from official public sources.

If you find PII in a published brief, dataset or fixture, report it privately as above and we'll remove it.
