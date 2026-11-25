# Project Yukikaki（雪かき）

**English** · [日本語](#日本語)

Small business owners in Japanese towns lose hours every week to paperwork, phone bookings, invoices, subsidy forms and other "snow shoveling" (雪かき) — necessary work that nobody wants to do. At the same time, local students can already automate much of it with AI tools, but they never meet these owners.

Project Yukikaki connects the two. A business owner describes the problem in a short voice interview. The app turns it into a grounded, reviewed **challenge brief**. A town host approves it, students form a team and build a solution, and afterwards the owner tells us how many hours it actually saves.

It is MIT-licensed and built so **any town or municipality can fork it** and run it with its own city data, hosts and partners.

## How it works

1. A business owner signs in and does a **10-minute voice interview** (or fills in a text form).
2. The interview becomes a draft brief. The app searches **official sources only** (ministries and agencies, prefectures and municipalities, public bodies, universities) for data and context about the business's city and industry. If the exact city has nothing, it looks at **similar cities** (for Sapporo: Asahikawa, Aomori, Nagano) and adjacent industries, then national statistics.
3. If the brief is grounded in real sources, the app generates **synthetic Japanese stand-in data** from those sources so students never need the owner's private data.
4. An AI workflow **pre-reviews** the brief (completeness, feasibility, privacy, grounding). It only recommends.
5. A **town host approves** the brief in `/admin`. It is published to the challenge board and the challenge graph.
6. Students form a **team**. The creator is the **lead** — the owner's single point of contact. The host approves the team.
7. The lead submits the **delivery** and stays the owner's support contact for **90 days**.
8. The host sends an **impact check**: a single-use link (valid 14 days). The owner answers a short questionnaire, optionally by voice. The admin Impact tab totals **hours saved per week**.

## Partner tools

Each tool owns exactly one job.

| Piece | What it does | Partner tool |
|---|---|---|
| Challenge interview | A 10-minute voice interview becomes a challenge brief (plus a 3-minute voice impact review) | **ElevenLabs** |
| Data and context search | Finds official data sets and background for each brief, with sources | **Linkup** |
| Challenge graph | Links challenges, data, stakeholders, venues, funders and builders | **Neo4j** |
| Approval workflow | The host reviews and approves each brief and team (AI pre-review; the host decides) | **Dify** |
| Records | Briefs, data sources and teams | **Neon** |
| Stand-in data | Synthetic Japanese data where real data is private | **Adaption Labs** |

Also used: **Clerk** (sign-in) and **Resend** (impact-check emails).

All eight services are live dependencies and their keys are required. There is no "no keys" mode.

## Live-only mode

Set `REQUIRE_LIVE_SERVICES=true` (recommended for every real deployment and demo):

- The brief pipeline never substitutes pre-baked data. If a live call fails (for example Linkup or Adaption Labs), the failure is written to the brief's **AI review issues** in `/admin` (e.g. "Linkup search failed (live-only mode)…"). There is no automatic retry — the host sees the gap and decides (for example, reject with a note asking for a new interview once the service is back).
- `pnpm check:services` exits non-zero unless **all 8 services** (Clerk, database, Neo4j, ElevenLabs, Linkup, Dify, Adaption Labs, Resend) are configured and reachable.

The files in `seed/prebaked/` are **demo seed data only**: `pnpm seed` loads them into the seeded demo briefs. In live-only mode they are never used for new briefs.

## Setup

Requirements: Node.js 20+, pnpm, and accounts for the services below (all have free tiers or trials).

### 1. Fork, install, configure

```bash
pnpm install
cp .env.example .env.local   # then fill in every key (see the table below)
```

Set `REQUIRE_LIVE_SERVICES=true`, `APP_URL=http://localhost:3100`, `HOST_EMAILS` (your town hosts, comma separated) and `FEEDBACK_TOKEN_SECRET` (`openssl rand -hex 32`).

| Service | Where | Variables | Notes |
|---|---|---|---|
| Clerk | dashboard.clerk.com or the Clerk CLI | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk v7 requires keys, also locally. With the CLI: `clerk apps create`, then `clerk env pull`. |
| Neon | console.neon.tech | `DATABASE_URL` | Create the project in region **aws-ap-southeast-1** (Singapore — the closest to Japan). |
| Neo4j Aura | console.neo4j.io | `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | Create an **AuraDB Free** instance and copy its credentials (see below). |
| ElevenLabs | elevenlabs.io | `ELEVENLABS_API_KEY`; `ELEVENLABS_WEBHOOK_SECRET` (production) | The two agent IDs are written by `pnpm setup:elevenlabs`. |
| Linkup | app.linkup.so | `LINKUP_API_KEY` | |
| Dify | cloud.dify.ai | `DIFY_API_URL`, `DIFY_BRIEF_REVIEW_KEY`, `DIFY_TEAM_REVIEW_KEY` | |
| Adaption Labs | adaptionlabs.ai | `ADAPTION_API_KEY` (and `ADAPTION_API_URL` if your account uses another host) | |
| Resend | resend.com | `RESEND_API_KEY`, `EMAIL_FROM` | Needs a verified sending domain (see below). |

**Neo4j Aura.** In the Aura console choose **Create instance → Free** ($0, no API key needed). The credentials screen shows the password **only once** — copy it (or download the credentials file) before closing. Set `NEO4J_URI=neo4j+s://<instance-id>.databases.neo4j.io`, `NEO4J_USERNAME` to the username shown on the credentials screen (on current Aura Free this is the instance id, not `neo4j`) and `NEO4J_PASSWORD` to that password, then run `pnpm graph:rebuild`. An Aura Free instance pauses after a few days without activity — resume it from the console; if it stays paused for 30 days it is deleted. Neon stays the source of truth, so `pnpm graph:rebuild` restores the graph onto any new instance.

**Resend domain.** Under *Domains*, add a sending subdomain (e.g. `mail.yourtown.example.jp`) and create the DNS records Resend shows: the **DKIM TXT** record, the **SPF MX + TXT** records and the **CNAME**. Wait until it is *Verified*, then set `EMAIL_FROM="Yukikaki <noreply@mail.yourtown.example.jp>"`. The test sender `onboarding@resend.dev` only delivers to the Resend account owner's own address, so it cannot reach business owners.

### 2. Database and seed

```bash
pnpm db:push        # apply migrations to Neon
pnpm seed           # demo users, businesses, briefs, teams, local entities (+ seed/prebaked demo seed data)
pnpm graph:rebuild  # project the published records into Neo4j
```

### 3. ElevenLabs agents

```bash
pnpm setup:elevenlabs
```

Creates (or updates, matched by name) both voice agents from [docs/elevenlabs-agents.md](docs/elevenlabs-agents.md): a Japanese voice from the shared voice library, TTS model `eleven_flash_v2_5`, authentication required, and the data-collection fields defined in the doc. It writes `ELEVENLABS_INTERVIEW_AGENT_ID` and `ELEVENLABS_IMPACT_AGENT_ID` into `.env.local`.

### 4. Dify workflows

```bash
pnpm dify:build     # regenerates dify/brief-review.yml and dify/team-review.yml
```

In Dify: *Studio → Create → Import DSL*, import both files (they use Dify Cloud's built-in OpenAI `gpt-4o-mini`; switch the LLM nodes if you prefer). **Publish**, then *Access Point → Backend Service API → API Key*, and paste the keys into `DIFY_BRIEF_REVIEW_KEY` / `DIFY_TEAM_REVIEW_KEY`. Verify:

```bash
pnpm smoke:dify
```

### 5. Pre-bake the demo seed data (optional)

```bash
pnpm prebake        # or: pnpm prebake --only <slug>
```

Runs the real pipeline for every seeded brief in two phases: (1) live Linkup grounding on official sources, starting or reusing an Adaption Labs dataset per brief; (2) waiting for all Adaption datasets in parallel and storing their rows. Results go to `seed/prebaked/*.json`, which `pnpm seed` loads as demo seed data. An existing file is only replaced by a grounded result.

### 6. Check and run

```bash
pnpm check:services        # must show ✓ for all 8 services in live-only mode
pnpm dev --port 3100       # port 3000 is often taken by other local tools
```

Open <http://localhost:3100/ja> (or `/en`). Sign in with an address from `HOST_EMAILS` to become a host. After an interview, `pnpm tsx scripts/inspect-latest.ts` prints the newest brief's live pipeline output (sources, stand-in data, AI review) and the service calls made for it.

### 7. Your town

1. **Your city:** add one row for your town to `CITY_PROFILES` in `lib/grounding/city-profiles.ts` (snowfall, January temperature, population, coastal, tourism, aging, and the city's official site domain). This finds your "analog cities" and lets grounding accept your city's own site. If your local industries are missing, add them to `lib/grounding/industry-neighbors.ts`.
2. **Your local partners:** edit the seed file (`seed/seed.json`, shape defined in `lib/seed-schema.ts`) — especially `entities`: the stakeholders, venues and funders in your town. Use your city name exactly as in `city-profiles.ts`.
3. Re-run `pnpm seed` and `pnpm graph:rebuild`.
4. Deploy: see [docs/deploy.md](docs/deploy.md).

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev --port 3100` | Start the Next.js dev server (use 3100; 3000 may be taken) |
| `pnpm build` | Production build |
| `pnpm test` | Unit and integration tests (Vitest, in-memory PGlite) |
| `pnpm test:e2e` | End-to-end tests (Playwright; starts or reuses `pnpm dev` on `E2E_PORT`, default 3100) |
| `pnpm typecheck` | TypeScript check (`tsc --noEmit`) |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Generate a new SQL migration from `lib/db/schema.ts` (Drizzle Kit) |
| `pnpm db:push` | Apply migrations in `./drizzle` to the database in `DATABASE_URL` |
| `pnpm seed` | Load demo users, businesses, briefs, teams, local entities and the `seed/prebaked` demo seed data |
| `pnpm prebake` | Two-phase live run for seeded briefs (Linkup grounding, then parallel Adaption Labs generation) → `seed/prebaked/*.json` demo seed data |
| `pnpm graph:rebuild` | Wipe Neo4j and rebuild the challenge graph from the database |
| `pnpm check:services` | Check every service; in live-only mode exits non-zero unless all 8 are live |
| `pnpm setup:elevenlabs` | Create/update both ElevenLabs agents and write their IDs to `.env.local` |
| `pnpm dify:build` | Regenerate `dify/*.yml` from `scripts/build-dify.ts` (brief review: ① intake → ② privacy redaction → ③ student-scope feasibility → ④ grounding audit → ⑤ bilingual editor → ⑥ house rules → ⑦ return; team review: ① intake → ② roster & lead check → ③ skill fit → ④ pitch review → ⑤ house rules → ⑥ return) |
| `pnpm smoke:dify` | Run both published Dify workflows once with a demo brief and print the parsed result (uses a few Dify credits) |
| `pnpm tsx scripts/inspect-latest.ts` | Show the newest brief's pipeline output and the service calls made since it was created |

## When a live call fails

Every external call goes through one guard (`withFallback` in `lib/integrations/_guard.ts`). It applies a timeout, logs a row to `service_events` and returns an empty result instead of crashing, so a brief always reaches the host queue. The admin page shows a service status strip built from those rows. Failures are reported, never hidden:

| Service fails | What the host sees |
|---|---|
| Linkup | Issue on the brief: "Linkup search failed (live-only mode)…". The brief has no grounding and no stand-in data. |
| Adaption Labs | Issue on the brief: "Adaption Labs call failed (live-only mode)…". The grounding sources are still shown. |
| Dify | **"AI review unavailable"** with the error. The host still decides. |
| Neo4j | Graph panels show **"Graph unavailable"**. Run `pnpm graph:rebuild` once it is back. |
| ElevenLabs | Voice is unavailable on `/interview`; the owner can use the text form. |
| Resend | The email was not sent, so the impact-check link is shown in `/admin` with a **Copy** button. |
| Neon / Clerk | The app cannot run. |

## Rules the code enforces

1. **The database (Neon) is the source of truth.** Neo4j is a projection that can always be rebuilt.
2. **AI only recommends.** Only a host decision changes a brief's or team's status (`lib/decide.ts`).
3. **Only official sources ground a brief.** Linkup searches are restricted to `go.jp`, `lg.jp`, `or.jp`, `ac.jp` and the city's own site; results from another municipality's site or from personal (`/~user/`) pages are rejected.
4. **No ungrounded synthetic data.** Stand-in data is only generated from real grounding sources.
5. **No silent substitutes.** In live-only mode a failed call is reported to the host, never replaced with pre-baked data.

## Docs

- [Architecture](docs/architecture.md) — flow, graph model, status machines, data model
- [Operator guide](docs/operator-guide.md) — handbook for town hosts (日本語 / English)
- [ElevenLabs agents](docs/elevenlabs-agents.md) — the two voice agents (prompts, fields, setup)
- [Deploy](docs/deploy.md) — Vercel + Neon production setup
- [Demo script](docs/demo-script.md) — a 3-minute walkthrough

## License

MIT — see [LICENSE](LICENSE). Fork it, rename it, run it for your town.

---

## 日本語

### 雪かきとは

地方の小さなお店や事業者は、書類作成、電話予約、請求書、補助金の申請など、毎週何時間も「雪かき」のような作業に追われています。必要だけれど、誰もやりたくない仕事です。一方で、地元の学生はAIツールを使ってその多くを自動化できるのに、そうした事業者と出会う機会がありません。

Project Yukikaki はこの両者をつなぎます。事業者が短い音声インタビューで困りごとを話すと、アプリが実データに裏付けられた**課題ブリーフ**を作ります。自治体の担当者（ホスト）が承認し、学生がチームを組んで解決策を作り、納品後には事業者が「実際に毎週何時間減ったか」を答えます。

MITライセンスで公開しており、**どの自治体でもフォークして**自分のまちのデータ・担当者・パートナーで運用できます。

### 流れ

1. 事業者がサインインし、**約10分の音声インタビュー**を受けます（テキスト入力も可）。
2. インタビューから下書きブリーフを作成。市区町村と業種について、**公的な情報源のみ**（省庁・都道府県・市区町村・公的団体・大学）から実データと背景情報を検索します。そのまちのデータがなければ、**気候や規模が似たまち**（札幌なら旭川・青森・長野など）や近い業種、さらに全国統計へと広げます。
3. 実データの裏付けがある場合のみ、その情報源をもとに**日本語の合成データ（代替データ）**を作ります。学生は事業者の個人データに触れる必要がありません。
4. AIワークフローがブリーフを**事前レビュー**します（完成度・実現可能性・個人情報・裏付けの質）。あくまで推奨です。
5. **ホストが `/admin` で承認**すると、課題ボードと課題グラフに公開されます。
6. 学生が**チーム**を作ります。作成者が**リーダー**となり、事業者の窓口になります。ホストがチームを承認します。
7. リーダーが**納品**し、その後**90日間**サポート窓口を務めます。
8. ホストが**効果確認**を送ります（1回限り・14日間有効のリンク）。事業者は短いアンケート（音声回答も可）に答え、管理画面の「インパクト」タブで**週あたりの削減時間**が集計されます。

### パートナーツール

| 機能 | 内容 | パートナー |
|---|---|---|
| 課題インタビュー | 10分の音声インタビューを課題ブリーフに（3分の音声効果レビューも） | **ElevenLabs** |
| データ・背景検索 | 各ブリーフの公的データと背景情報を出典付きで検索 | **Linkup** |
| 課題グラフ | 課題・データ・関係者・会場・資金提供者・学生をつなぐ | **Neo4j** |
| 承認ワークフロー | ホストが各ブリーフとチームを審査・承認（AIは事前レビューのみ） | **Dify** |
| 記録 | ブリーフ、データソース、チーム | **Neon** |
| 代替データ | 実データが非公開の場合の日本語合成データ | **Adaption Labs** |

そのほか **Clerk**（ログイン）と **Resend**（効果確認メール）を使います。8つのサービスはすべて実際に稼働している必要があり、APIキーは必須です（キーなしで動くモードはありません）。

### ライブ専用モード

`.env.local` で `REQUIRE_LIVE_SERVICES=true` を設定します（本番・デモでは必ず設定してください）。

- 外部サービスの呼び出しに失敗しても、事前取得データで代用しません。失敗は管理画面のブリーフの **AIレビューの指摘事項** に表示されます（例：「Linkup search failed (live-only mode)…」）。自動の再試行はありません。ホストが内容を見て判断します（例：メモを付けて却下し、サービス復旧後に改めてインタビューしてもらう）。
- `pnpm check:services` は、**8つのサービスすべて**（Clerk・データベース・Neo4j・ElevenLabs・Linkup・Dify・Adaption Labs・Resend）が設定済みで接続できない限り、エラー（終了コード ≠ 0）になります。

`seed/prebaked/` のファイルは**デモ用シードデータ専用**です。`pnpm seed` がデモ用ブリーフに読み込むだけで、ライブ専用モードでは新しいブリーフに使われることはありません。

### セットアップ

必要なもの：Node.js 20以上、pnpm、各サービスのアカウント（いずれも無料枠またはトライアルあり）。

1. リポジトリをフォークしてクローンし、`pnpm install`、`cp .env.example .env.local`。
2. 英語セクションの表にある各サービスのキーを `.env.local` に設定。`REQUIRE_LIVE_SERVICES=true`、`APP_URL=http://localhost:3100`、`HOST_EMAILS`、`FEEDBACK_TOKEN_SECRET`（`openssl rand -hex 32`）も設定します。
   - **Clerk**：v7 はローカルでもキーが必要です。Clerk CLI なら `clerk apps create` → `clerk env pull`。
   - **Neon**：リージョンは日本に最も近い **aws-ap-southeast-1**（シンガポール）を選びます。
   - **Neo4j Aura**：コンソールで **Create instance → Free**（無料、APIキー不要）を選びます。認証情報の画面に表示されるパスワードは**一度しか表示されない**ので、閉じる前にコピー（または認証情報ファイルをダウンロード）します。`NEO4J_URI=neo4j+s://<instance-id>.databases.neo4j.io`、`NEO4J_USERNAME` には認証情報の画面に表示されるユーザー名（現在の Aura Free では `neo4j` ではなくインスタンスID）、`NEO4J_PASSWORD` にはそのパスワードを設定し、`pnpm graph:rebuild` を実行します。Aura Free は数日間使われないと一時停止するので、コンソールから再開してください（停止したまま30日経つと削除されます）。正となるデータは Neon にあるため、新しいインスタンスでも `pnpm graph:rebuild` でグラフを復元できます。
   - **Resend**：送信用サブドメイン（例：`mail.yourtown.example.jp`）を追加し、表示される DNS レコード（**DKIM の TXT**、**SPF の MX と TXT**、**CNAME**）を登録して「Verified」になるまで待ちます。テスト用送信元 `onboarding@resend.dev` は Resend アカウント所有者本人のアドレスにしか届かないため、事業者には送れません。
3. `pnpm db:push` → `pnpm seed` → `pnpm graph:rebuild`。
4. `pnpm setup:elevenlabs`：[docs/elevenlabs-agents.md](docs/elevenlabs-agents.md) の内容から音声エージェントを2つ作成（既存なら更新）します。共有ボイスライブラリの日本語音声、TTSモデル `eleven_flash_v2_5`、認証必須、データ収集項目を設定し、エージェントIDを `.env.local` に書き込みます。
5. `pnpm dify:build` で `dify/*.yml` を生成 → Dify の「Studio → 作成 → DSLをインポート」で2つをインポート → 公開 → 「APIアクセス」でAPIキーを作成し `DIFY_BRIEF_REVIEW_KEY` / `DIFY_TEAM_REVIEW_KEY` に設定 → `pnpm smoke:dify` で動作確認。
6. （任意）`pnpm prebake`：シード用ブリーフについて、①Linkup で公的情報源から実際に裏付けを取得し、②Adaption Labs のデータ生成を並列で待って、`seed/prebaked/*.json`（デモ用シードデータ）に保存します。
7. `pnpm check:services` で8つすべてが ✓ になることを確認し、`pnpm dev --port 3100` で起動します（3000番は他のツールが使っていることが多いため）。<http://localhost:3100/ja> を開き、`HOST_EMAILS` のアドレスでログインするとホストになります。
8. 自分のまち：`lib/grounding/city-profiles.ts` に1行追加（降雪量・1月の平均気温・人口・沿岸か・観光度・高齢化率・市の公式サイトのドメイン）。`seed/seed.json` の `entities` に地元の関係者・会場・資金提供者を登録し、`pnpm seed`、`pnpm graph:rebuild` を再実行します。
9. 本番公開は [docs/deploy.md](docs/deploy.md) を参照。

### 外部サービスが失敗したとき

失敗は隠さず、ホストに表示されます。Linkup・Adaption Labs → ブリーフの指摘事項に失敗内容を表示（事前取得データでの代用はしません）、Dify → 「AIレビュー利用不可」と表示しホストが判断、Neo4j → 「グラフ利用不可」と表示（復旧後に `pnpm graph:rebuild`）、ElevenLabs → 音声が使えないためテキスト入力、Resend → 送れなかった効果確認リンクを管理画面にコピー用ボタン付きで表示。Neon と Clerk が止まるとアプリは動きません。

### 裏付けのルール

ブリーフの裏付けには公的な情報源だけを使います（`go.jp`・`lg.jp`・`or.jp`・`ac.jp` と市の公式サイト）。別の自治体のサイトや個人ページ（URL に `/~` を含むもの）は除外します。

### ドキュメント

- [アーキテクチャ](docs/architecture.md)
- [運営ガイド（ホスト向け）](docs/operator-guide.md)
- [ElevenLabs エージェント設定](docs/elevenlabs-agents.md)
- [デプロイ](docs/deploy.md)
- [デモ台本](docs/demo-script.md)

### ライセンス

MIT ライセンス（[LICENSE](LICENSE)）。自由にフォークして、あなたのまちで使ってください。
