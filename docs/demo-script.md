# Demo script (3 minutes) / デモ台本（3分）

A walkthrough for judges using the seeded demo data. Each step has an English line and a Japanese line — use whichever fits the audience.

## Before you start

```bash
pnpm check:services        # all 8 services must be ✓ (REQUIRE_LIVE_SERVICES=true)
pnpm db:push && pnpm seed  # seeded briefs carry demo seed data from seed/prebaked (made live by `pnpm prebake`)
pnpm graph:rebuild
pnpm dev --port 3100
```

- Put your email in `HOST_EMAILS` and sign in once so you are a host.
- Open two windows: one signed in as a **business owner**, one as the **host** (`/ja/admin`). A third (student) is nice but optional — seeded teams already exist.
- Pick, in advance, a seeded **Sapporo** brief that is `in_review` (the grounding cascade is easiest to show there), a seeded `delivered` brief for the impact step, and an `evaluated` one so the Impact tab already shows a total.
- Everything runs live. If a partner service fails mid-demo, the app reports it (issues on the brief, status strip) instead of faking data — say so honestly.

## 0:00 — Landing (15 s)

Open `http://localhost:3100/ja`.

- **EN:** "Small businesses in Japanese towns lose hours every week to paperwork and phone bookings — work we call *yukikaki*, snow shoveling. Students can automate it with AI, but they never meet. Yukikaki connects them, and any town can fork it."
- **JA:** 「地方の小さなお店は、書類や電話予約など“雪かき”のような作業に毎週何時間も取られています。学生はAIでそれを自動化できるのに、出会う場がありません。雪かきはその両者をつなぎ、どの自治体でもフォークして使えます。」

## 0:15 — Interview (35 s)

Business owner window → `/ja/interview`.

- Start the voice interview and answer two questions live, then end it.
- **EN:** "The owner just talks for ten minutes — in polite Japanese, or English. ElevenLabs turns the conversation into structured fields: problem, current process, hours lost per week, data sensitivity."
- **JA:** 「事業者は10分ほど話すだけです。ElevenLabs の音声エージェントが、困りごと・今のやり方・週に失っている時間・データの扱いなどを項目として取り出します。」
- Don't wait for the new brief to finish processing — switch to the prepared seeded brief.

## 0:50 — Admin queue: grounding cascade (45 s)

Host window → `/ja/admin`, open the seeded Sapporo brief.

- Point at the **grounding badges** and sources: only official sources (ministries, municipalities, public bodies, universities) count. If there was no usable Sapporo-specific data, the cascade went to **analog cities** — similar snowfall, climate and size (Asahikawa, Aomori…) — via Linkup, each with a source link.
- Point at the **Synthetic** data set: Adaption Labs stand-in rows, generated *only* from those grounding facts.
- Point at the **AI badge, score, issues and PII check** from Dify.
- **EN:** "Linkup found real data from official sources only — and when the exact city had none, it looked for cities that are physically similar: same snow, same winters. Adaption Labs then generated Japanese stand-in data seeded only from those sources — no grounding, no synthetic data. Dify pre-reviewed it, but it only recommends."
- **JA:** 「Linkup が省庁や自治体などの公的な情報源だけから、出典付きで実データを探します。札幌のデータがなければ、雪の量や気候が似たまち（旭川・青森など）を探します。その裏付けだけをもとに、Adaption Labs が日本語の代替データを作ります。裏付けがなければ合成データは作りません。Dify がAIで事前レビューしますが、あくまで推奨です。」

## 1:35 — Approve (10 s)

Type a short note and click **Approve**.

- **EN:** "Only a human host can approve. Every decision is logged."
- **JA:** 「承認できるのはホストだけです。すべての判断は記録されます。」

## 1:45 — Challenge page with graph (25 s)

Open the approved challenge on the challenge board.

- Show the bilingual brief, the data sources and the **graph panel** (Neo4j): the challenge linked to its business, city, analog cities, datasets, skills, plus local stakeholders, venues and funders — and matching student builders.
- **EN:** "Neo4j links each challenge to data, local stakeholders, venues, funders and students with the right skills. Neon stays the source of truth; the graph can be rebuilt any time."
- **JA:** 「Neo4j が、課題とデータ、地元の関係者・会場・資金提供者、そしてスキルの合う学生をつなぎます。正本は Neon のデータベースで、グラフはいつでも作り直せます。」

## 2:10 — Student team with lead badge (20 s)

Show a seeded team on a challenge (or in the admin **Teams** tab).

- Point at the **Lead** badge.
- **EN:** "Students form a team. The creator is the lead — exactly one, enforced by the database. The lead is the owner's single contact, and after delivery, their support contact for 90 days."
- **JA:** 「学生がチームを作ります。作成者がリーダーで、必ず1人だけです（データベースで保証）。リーダーが事業者の窓口となり、納品後90日間はサポート担当です。」

## 2:30 — Delivery and impact link (20 s)

Admin → **Deliveries** tab → seeded delivery → **Send impact check**.

- The owner gets an email from the verified Resend domain (if the send fails, the link appears with a **Copy** button). Open it.
- **EN:** "The host sends a one-time impact link, valid for 14 days. The owner answers a short form — or a three-minute voice review."
- **JA:** 「ホストが1回限り・14日間有効の効果確認リンクを送ります。事業者は短いアンケート、または3分の音声レビューで答えます。」

## 2:50 — Impact total (10 s)

Admin → **Impact** tab.

- **EN:** "And this is the number a town council cares about: hours saved per week, measured by the owners themselves. MIT-licensed — fork it for your town."
- **JA:** 「自治体にとって一番大事な数字、週あたりの削減時間です。事業者自身の回答で測っています。MITライセンスなので、あなたのまちでもすぐ使えます。」

## If something breaks during the demo

| Symptom | Say / do |
|---|---|
| Voice doesn't start | Use the text form: "Owners can also type." Check `pnpm check:services` afterwards. |
| Issue "Linkup search failed (live-only mode)" | "Linkup didn't answer, and we never fake grounding — the host sees exactly that." Switch to a seeded brief. |
| Issue "Adaption Labs call failed" | "No stand-in data yet — and none is invented." |
| "AI review unavailable" | "Dify is down, but the host still decides — the AI was only ever advice." |
| "Graph unavailable" | "Neo4j is a projection; suggestions are computed from the database." |
| Impact email not sent | Click **Copy** and share the link by LINE. |

`pnpm tsx scripts/inspect-latest.ts` shows what the newest brief got from each service, if you need to debug after the demo.
