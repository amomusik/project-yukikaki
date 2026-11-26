# Contract fixtures

Recorded or documented partner-API payloads used by `tests/contract/*` (`pnpm test:contract`).

| file | provenance |
|---|---|
| `dify-brief-review.json` | recorded Dify `/v1/workflows/run` blocking response (brief-review) |
| `elevenlabs-interview.json`, `elevenlabs-impact.json` | recorded ElevenLabs `GET /v1/convai/conversations/{id}` (ids replaced) |
| `linkup-search.json` | recorded Linkup `/v1/search` (`outputType: searchResults`), trimmed |
| `jgrants-search.json`, `jgrants-detail.json` | recorded jGrants public API v1 |
| `adaption-list.json`, `adaption-status.json` | recorded 2026-11-26 from Adaption `GET /api/v1/datasets` and `/datasets/{id}` (user/run ids redacted) |
| `adaption-download.json` | shape of `GET /datasets/{id}/download?fileFormat=json` per the parser; the live endpoint returned HTTP 500 when recording on 2026-11-26 |
| `resend-send.json` | documented Resend `POST /emails` success body (`{ id }`); not recorded to avoid sending mail |

When a partner changes its API, re-record the fixture and let the contract test tell you what broke.
