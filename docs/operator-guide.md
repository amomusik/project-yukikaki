# 運営ガイド（ホスト向け） / Operator guide (for town hosts)

[日本語](#日本語) · [English](#english)

---

## 日本語

このガイドは、自治体や商工会などで Project Yukikaki を運営する「ホスト」向けです。ホストは、事業者の課題ブリーフと学生チームを審査し、承認・却下を決める人です。**AI はおすすめを出すだけで、決めるのはホストです。**

### 1. ホストになる

1. 運営担当者が `.env.local`（本番では Vercel の環境変数）の `HOST_EMAILS` に、あなたのメールアドレスを追加します。複数人の場合はカンマ区切りです。
   例：`HOST_EMAILS=tanaka@city.example.jp,suzuki@city.example.jp`
2. そのメールアドレスでサインインします（すでにサインインしている場合は、ページを再読み込み）。
3. 自動的にホスト権限が付き、`/ja/admin` が開けるようになります。

ホストは自分で選べる役割ではありません。`HOST_EMAILS` に載っている人だけがホストになれます。

### 2. 管理画面の見方

`/ja/admin` には次のタブがあります：**審査キュー（ブリーフ）**、**チーム**、**納品**、**インパクト**。画面上部には**サービス状況バー**があります。

#### 審査キュー

状態が「審査中（in_review）」のブリーフが並びます。各カードの見方：

| 表示 | 意味 |
|---|---|
| **AI バッジ** | Dify の事前レビュー結果。「承認推奨（approve）」「要修正（revise）」「却下推奨（reject）」。あくまで参考です。 |
| **スコア** | 0〜100。AI が見た「公開できる完成度」。 |
| **指摘事項** | AI や処理過程からの注意点（例：「裏付けデータなし」「Linkup search failed (live-only mode)」など、外部サービスの失敗もここに表示されます）。 |
| **個人情報の警告** | AI がインタビューやブリーフに個人情報（個人名、電話番号、住所など）を見つけた場合に表示。公開前に必ず確認してください。 |
| **「AIレビュー利用不可」** | Dify が使えなかった場合。AI の推奨なしで、ホストが内容を読んで判断します。 |

**裏付けバッジ**（データの根拠）：

| バッジ | 意味 |
|---|---|
| **Live（実データ）** | そのまち・その業種の公的な情報源（省庁・自治体・公的団体・大学のサイト）が見つかった（exact）。 |
| **Analog（類似都市）** | 気候や規模が似たまち、または近い業種の情報で裏付け。例：札幌 → 旭川・青森など。 |
| **Synthetic（代替データ）** | 実データをもとに作られた日本語の合成データ（Adaption Labs）。学生が個人データなしで開発・テストするためのもの。 |
| **Ungrounded（裏付けなし）** | 公的な情報源が見つからなかった、または検索に失敗した（指摘事項を確認）。合成データも作っていません。慎重に判断してください。 |

裏付けには公的な情報源（`go.jp`・`lg.jp`・`or.jp`・`ac.jp`、市の公式サイト）だけを使います。ブログや個人ページ、別の自治体のサイトは使いません。事前取得データで代用することはありません（デモ用のシードブリーフだけは、事前に実際の検索で取得したデモ用データを使います）。

全国統計しか見つからなかった場合は、AI のコメント（grounding_comment）にその旨が出ます。

#### 承認・却下

1. ブリーフを開き、内容（日本語・英語）、インタビューの文字起こし、情報源を確認します。
2. **承認**または**却下**を押します。**メモ**を書けます（却下の理由など）。メモは判断記録として保存されます。
3. 承認すると、ブリーフは課題ボードと課題グラフに公開され、学生がチームを作れるようになります。
4. 却下したブリーフは、修正後に再提出されると再び審査キューに戻ります。

すべての判断は、誰がいつ何を決めたかが記録されます。

### 3. サービス状況バー

画面上部の色付きの表示は、各外部サービスの最近の呼び出し結果（成功・失敗）をまとめたものです。

| サービス | 担当 | 赤（失敗）のときに起きること |
|---|---|---|
| ElevenLabs | 音声インタビュー | 音声が使えないため、事業者はテキスト入力フォームで回答します。 |
| Linkup | データ・背景検索 | ブリーフは裏付けなしのまま審査キューに入り、指摘事項に失敗内容が表示されます。 |
| Adaption Labs | 代替データ | 代替データなしで審査キューに入り、指摘事項に失敗内容が表示されます。 |
| Dify | AI 事前レビュー | 「AIレビュー利用不可」と表示。ホストは通常どおり判断できます。 |
| Neo4j | 課題グラフ | グラフ欄に「グラフ利用不可」と表示。学生の候補は別の方法で計算されます。 |
| Resend | メール送信 | メールが送れなかった効果確認リンクが管理画面に表示されるので、コピーして送ります。 |
| Neon | データベース | 必須です。止まるとアプリ全体が使えません。 |
| Clerk | ログイン | 必須です。 |

**赤になったら：**

1. 慌てなくて大丈夫です。Neon と Clerk 以外は、止まっても審査やチーム承認は続けられます。ただし、失敗の影響を受けたブリーフは指摘事項に表示されるので、自動で作り直されることはありません。内容をよく確認し、必要ならメモを付けて却下し、復旧後に改めてインタビューしてもらってください。
2. 技術担当者に連絡し、`pnpm check:services` を実行してもらいます（8つのサービスのどれに問題があるか表示され、1つでも稼働していなければエラーになります）。
3. よくある原因：API キーの期限切れ・入力ミス、無料枠の上限、サービス側の障害。
4. Neo4j が復旧したら、技術担当者に `pnpm graph:rebuild` を実行してもらうとグラフが最新に戻ります。
5. Dify が止まっている間に審査キューに入ったブリーフは、AI レビューなしのままです。内容をよく読んで判断してください。

### 4. チームタブ

学生チームの申請（状態「保留中」）が並びます。

- **リーダーバッジ**：チームを作った学生がリーダーです。各チームにリーダーは必ず1人だけです（データベースで保証）。リーダーは事業者の窓口で、納品後90日間のサポート担当になります。リーダーは他のメンバーに役割を引き継げます。
- **AI バッジ・スコア・指摘事項**：Dify のチームレビュー（スキルの合致、人数、提案内容、リーダーの有無）。
- **承認**すると、チームが活動を開始し、ブリーフは「進行中」になります。**却下**も可能です（メモ付き）。

### 5. 納品タブと効果確認

リーダーが納品すると、ここに表示されます（概要、リンク、引き継ぎメモ、サポート期限）。

1. 事業者がツールをしばらく使ったら、**「効果確認を送る」**を押します。
2. 1回限り・14日間有効のリンクが作られ、事業者のメールアドレスに送られます。
3. **メールが送れなかった場合**（Resend の障害、または事業者のメールアドレスがない場合）は、リンクが管理画面に表示されます。**コピー**ボタンで写し、LINE・SMS・メールなどで事業者に送ってください。
4. 事業者は短いアンケートに答えます（週あたりの削減時間、満足度、今も使っているか、問題点、他の人に勧めるか）。約3分の音声レビューも任意で使えます。
5. 回答が届くと、ブリーフは「評価済み」になります。

リンクは一度しか使えません。期限切れや使用済みの場合は、もう一度「効果確認を送る」を押して新しいリンクを作ってください。

### 6. インパクトタブ

評価済みの納品について、**週あたりの削減時間の合計**や個別の回答を確認できます。議会や予算の報告にそのまま使える数字です。

### 7. グラフの再構築

課題グラフ（Neo4j）は、データベースの内容から作られる「写し」です。おかしく見えるとき、Neo4j を新しくしたとき、障害から復旧したときは、技術担当者が次を実行します（Aura Free は数日間使われないと一時停止するので、先に Aura のコンソールから再開します。停止したまま30日経つと削除されますが、このコマンドで新しいインスタンスにグラフを復元できます）：

```bash
pnpm graph:rebuild
```

グラフを一度消して、公開済みのブリーフ・チーム・納品・学生からすべて作り直します。データベースのデータは消えません。

---

## English

This guide is for **hosts**: the town hall, chamber of commerce or program staff who review challenge briefs and student teams. **The AI only recommends. The host decides.**

### 1. Becoming a host

1. An operator adds your email to `HOST_EMAILS` (in `.env.local`, or in Vercel environment variables in production). Separate multiple emails with commas.
2. Sign in with that email (or reload if you are already signed in).
3. You are promoted to host automatically and can open `/en/admin`.

Host cannot be chosen during onboarding — only `HOST_EMAILS` grants it.

### 2. Reading the admin page

`/en/admin` has tabs for the **review queue (briefs)**, **teams**, **deliveries** and **impact**, and a **service status strip** at the top.

#### Review queue

Briefs in `in_review`. On each card:

| Element | Meaning |
|---|---|
| **AI badge** | Dify's pre-review: approve / revise / reject. Advice only. |
| **Score** | 0–100 readiness score from the AI. |
| **Issues** | Notes from the AI and from the pipeline (e.g. "Ungrounded", "Linkup search failed (live-only mode)…"). Failed service calls are reported here. |
| **PII warning** | The AI found personal data (private names, phone numbers, addresses…) in the brief or transcript. Check before publishing. |
| **"AI review unavailable"** | Dify could not be reached. Read the brief and decide yourself. |

**Grounding badges:**

| Badge | Meaning |
|---|---|
| **Live** | Official sources (ministry, municipality, public body or university sites) about the same city and industry (level `exact`). |
| **Analog** | Backed by similar cities (snow, climate, size) or adjacent industries. |
| **Synthetic** | Japanese stand-in data generated from real sources (Adaption Labs), so students can build without private data. |
| **Ungrounded** | No official sources found, or the search failed (check the issues). No synthetic data was generated. Decide with care. |

Only official sources ground a brief: `go.jp`, `lg.jp`, `or.jp`, `ac.jp` and the city's own site. Blogs, personal pages and other municipalities' sites are never used. Failed searches are never replaced with pre-fetched data (only the seeded demo briefs carry demo seed data, fetched live in advance).

When only national statistics were found, the AI's grounding comment says so.

#### Approve or reject

1. Open the brief and check the content (Japanese and English), the transcript and the sources.
2. Click **Approve** or **Reject**. You can add a **note** (e.g. the reason for rejecting). It is saved in the decision log.
3. Approved briefs are published to the challenge board and the challenge graph; students can now form teams.
4. A rejected brief returns to the queue if it is edited and resubmitted.

### 3. Service status strip

Each light summarises recent calls to one external service (from the `service_events` log).

| Service | Job | When it is red |
|---|---|---|
| ElevenLabs | Voice interview | Voice is unavailable; owners use the text form. |
| Linkup | Data and context search | Briefs reach the queue ungrounded, with the failure listed in their issues. |
| Adaption Labs | Stand-in data | Briefs reach the queue without stand-in data, with the failure listed in their issues. |
| Dify | AI pre-review | "AI review unavailable". You can still decide. |
| Neo4j | Challenge graph | Graph panels show "Graph unavailable"; builder suggestions still work. |
| Resend | Email | Impact links that could not be emailed appear in admin with a Copy button. |
| Neon | Database | Required — the app stops without it. |
| Clerk | Sign-in | Required. |

**What to do when a service is red:**

1. You can keep reviewing — only Neon and Clerk stop the app. Briefs affected by a failure show it in their issues; they are not re-processed automatically. Check them carefully; if needed, reject with a note and ask the owner to interview again once the service is back.
2. Ask your technical contact to run `pnpm check:services` (it fails unless all 8 services are live).
3. Typical causes: expired or mistyped API key, free-tier quota reached, provider outage.
4. After Neo4j recovers, run `pnpm graph:rebuild`.
5. Briefs that entered the queue while Dify was down keep "AI review unavailable" — review them manually.

### 4. Teams tab

Pending team applications.

- **Lead badge:** the student who created the team is the lead. There is always exactly one lead per team (enforced by the database). The lead is the owner's contact and the support contact for 90 days after delivery. A lead can hand the role to another member.
- **AI badge, score, issues:** Dify's team review (skill fit, size, pitch, lead named).
- **Approve** starts the team and moves the brief to `in_progress`. **Reject** is also possible, with a note.

### 5. Deliveries tab and impact checks

Deliveries submitted by team leads (summary, links, handover notes, support-until date).

1. Once the owner has used the solution for a while, click **Send impact check**.
2. A single-use link valid for 14 days is created and emailed to the owner.
3. **If the email could not be sent** (Resend down, or no owner email), the link is shown in admin. Use **Copy** and send it by LINE, SMS or email.
4. The owner answers a short questionnaire (hours saved per week, satisfaction 1–5, still in use, issues, would recommend), optionally with a ~3-minute voice review.
5. When submitted, the brief becomes `evaluated`.

Links work once. If one expired or was used, click Send impact check again to create a new one.

### 6. Impact tab

Shows the **total hours saved per week** across evaluated deliveries, plus individual answers — ready for council or budget reports.

### 7. Rebuilding the graph

The challenge graph in Neo4j is a copy derived from the database. If it looks wrong, after switching Neo4j instances, or after an outage, run (an Aura Free instance pauses after a few days without activity — resume it from the Aura console first; one left paused for 30 days is deleted, and this command restores the graph onto a new instance):

```bash
pnpm graph:rebuild
```

It wipes the graph and rebuilds it from all published briefs, teams, deliveries and students. No database data is touched.
