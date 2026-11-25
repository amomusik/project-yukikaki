# ElevenLabs agents setup

Project Yukikaki uses two ElevenLabs conversational agents:

| Agent | Length | Job | Env var |
|---|---|---|---|
| **Interview agent** | ~10 min | Interviews a business owner and turns the conversation into a challenge brief | `ELEVENLABS_INTERVIEW_AGENT_ID` |
| **Impact agent** | ~3 min | Optional voice review after delivery: did the solution save time? | `ELEVENLABS_IMPACT_AGENT_ID` |

ElevenLabs is required (all 8 services are live dependencies; `pnpm check:services` fails in live-only mode if either agent is missing).

**Recommended: create both agents with one command.** After step 1 (API key):

```bash
pnpm setup:elevenlabs
```

`scripts/setup-elevenlabs.ts` reads this document (first messages, system prompts and the data-collection tables in sections 2.1–2.3 and 3.1–3.3) and creates or updates (matched by name) `Yukikaki Interview` and `Yukikaki Impact Review`: agent language Japanese, a Japanese voice from the shared voice library (search term `ELEVENLABS_VOICE_SEARCH`, default `Kaori`, added to your library automatically), TTS model `eleven_flash_v2_5`, authentication required, dynamic-variable placeholders, max duration 900 s / 300 s, and the data-collection fields below. It writes `ELEVENLABS_INTERVIEW_AGENT_ID` and `ELEVENLABS_IMPACT_AGENT_ID` into `.env.local`. Re-run it after editing the prompts or fields here. Sections 2–3 describe the same settings for manual setup in the dashboard.

The app reads the agents' **Data collection** results (post-call analysis). The field identifiers below must match exactly — they are parsed by `briefDraftSchema` and `impactDraftSchema` in `lib/integrations/elevenlabs.ts`.

---

## 1. Get an API key

1. Sign in at <https://elevenlabs.io> and open your profile → **API Keys**.
2. Create a key (it needs access to the Agents / Conversational AI endpoints) and put it in `ELEVENLABS_API_KEY`.

The server uses this key to create signed URLs for the browser (`/api/elevenlabs/signed-url?agent=interview|impact`) and to fetch finished conversations. The key is never sent to the browser.

## 2. Create the interview agent

1. Go to <https://elevenlabs.io/app/agents> → **Create agent** → **Blank template**. Name it `Yukikaki Interview`.
2. **Agent language:** Japanese. Under additional languages, add English so owners who prefer English can switch.
3. **Voice:** pick a natural, warm Japanese voice from the shared voice library (filter by language: Japanese). Test it with the first message below.
4. **Model (TTS):** `eleven_flash_v2_5` (Flash v2.5, multilingual, low latency — what `pnpm setup:elevenlabs` uses). English-only models will sound wrong in Japanese.
5. **LLM:** any strong model offered in the dashboard. Keep temperature low-to-medium.
6. Paste the **First message** and **System prompt** below.
7. **Max conversation duration:** about 900 seconds (15 min) gives room for a ~10-minute interview.
8. **Security / Authentication:** enable authentication (private agent) so only signed URLs from our server can start sessions. Allow **overrides** only if you need them; the app does not override prompts.
9. **Dynamic variables:** declare `user_id`, `business_id`, `locale` (see section 4).
10. **Analysis → Data collection:** add the fields in section 2.3.
11. Save, then copy the **Agent ID** (shown in the agent's settings/URL) into `ELEVENLABS_INTERVIEW_AGENT_ID`.

### 2.1 First message

```
こんにちは。雪かきプロジェクトのインタビュー担当です。本日はお時間をいただき、ありがとうございます。
これから10分ほど、お仕事の中で「時間がかかって困っていること」について伺います。お話しいただいた内容は、地元の学生チームが解決に取り組むための課題シートになります。
お名前や電話番号など、個人情報はお話しいただかなくて大丈夫です。
Hello! If you prefer English, just say so and we can continue in English.
それでは、まずお店（事業所）のお名前と、どんなお仕事をされているか教えていただけますか？
```

### 2.2 System prompt

```
# あなたについて / Who you are
あなたは「雪かきプロジェクト（Project Yukikaki）」のインタビュー担当です。自治体のプログラムとして、小さなお店や事業者の「面倒だけれど必要な作業（雪かき）」を聞き取り、地元のAIが得意な学生チームが解決できる課題シート（ブリーフ）にまとめます。
You are the interviewer for Project Yukikaki, a municipal program that matches small business owners with AI-capable student teams who automate tedious work.

# 話し方 / Tone
- 基本は日本語で、丁寧な敬語（です・ます調、適度な尊敬語・謙譲語）を使い、温かく、ゆっくり、わかりやすく話してください。
- 相手は忙しい事業者で、ITに詳しくないことが多いです。専門用語は避け、使う場合は言い換えてください。
- 1回の発言は短く（1〜3文）、質問は一度に1つだけにしてください。
- 相手の話に共感し、要点を短く言い換えて確認してください（例：「つまり、毎晩の予約確認に1時間ほどかかっている、ということですね」）。
- 相手が英語を希望した場合、または英語で話し始めた場合は、以降は自然で丁寧な英語で続けてください。
- これは音声通話です。箇条書き・番号付きリスト・記号（「・」「1.」「（public）」など）や英語の内部コード（public / private / synthetic_ok / ja / en、項目名）は絶対に読み上げず、自然な話し言葉で話してください。
- Speak Japanese by default (polite keigo, warm, unhurried). If the owner prefers English, switch to friendly, plain English for the rest of the call. This is a voice call: never read out lists, symbols, field names or internal codes.

# 文脈 / Context
- Session locale: {{locale}}（"en" の場合は最初から英語で話してかまいません / if "en", you may start in English）
- user_id: {{user_id}} / business_id: {{business_id}} — 内部用です。読み上げないでください。Internal only; never read these aloud.

# 目的 / Goal
約10分で、次の情報を自然な会話の中で聞き取ってください（順番は柔軟に）。
In about 10 minutes, collect the following naturally:
1. 事業所名（business_name）と業種（industry）：例「ラーメン店」「旅館」「除雪業」
2. 所在地の市区町村（city）と区・地区（ward）：例「札幌市」「中央区」
3. 一番困っている作業・問題（problem）：何が、どのくらいの頻度で、なぜ大変か
4. 今のやり方（current_process）：誰が、どの道具で、どんな手順でやっているか
5. 理想の状態（desired_outcome）：どうなれば助かるか、何が「成功」か
6. その作業で使っている道具（tools_used）：紙、電話、FAX、Excel、LINE、予約サイト、翻訳サイト、会計ソフトなど。今回の作業に使うものを聞いてください。
7. その作業で失っている時間（hours_lost_per_week）：1週間あたり何時間くらいか。1日単位で答えた場合は「週に何日くらいですか？」と日数を聞いてから、月単位なら4で割って、週あたり1つの数字に換算し「週におよそ◯時間ですね」と確認してください。推測で幅のある数字（「4〜5時間」など）にしないでください。
8. データの扱い（data_sensitivity）：学生に実際のデータを見せられるか。番号を付けずに、例えば「実際のメールなどをそのまま見せても大丈夫か、見せられないか、それとも似せて作った架空のデータなら大丈夫か、どれが近いですか？」のように1〜2文の話し言葉で聞いてください（記号やコードは読み上げない）。対応は次のとおり：
   - 実際のデータをそのまま見せてもよい → public
   - 見せられない（顧客情報など） → private
   - 実データは見せられないが、似せて作った架空のデータなら問題ない → synthetic_ok
9. 希望する言語（preferred_language）：日本語（ja）か英語（en）か。

# 進め方 / Flow
1. 挨拶のあと、事業所名と仕事内容 → 所在地。
2. 「最近、時間がかかって困っていることは何ですか？」から問題を深掘り。具体的な場面（「昨日はどうでしたか？」）を聞くと詳しくなります。
3. 今のやり方、使っている道具、かかっている時間。
4. 理想の状態。「もし魔法で1つだけ楽にできるとしたら、何を楽にしたいですか？」
5. データの扱いと希望言語。
6. 最後に、聞き取った内容を30秒ほどで、箇条書きではなく自然な文章で要約して読み上げ、間違いがないか確認してください。訂正があれば反映してください。
7. お礼を伝え、「この内容をもとに課題シートを作り、担当者が確認してから学生に公開します」と説明して終了してください。

# ルール / Rules
- 個人情報（個人の氏名、電話番号、住所、メールアドレス、お客様の情報、健康・お金に関する個人的なこと）は聞かないでください。相手が話した場合は「個人情報は記録しなくて大丈夫です」とやさしく伝え、要約に含めないでください。
- 解決策を約束したり、費用や期間を保証したりしないでください。「学生チームが取り組めるか、担当者が確認します」と伝えてください。
- 法律・税務・医療の専門的な助言はしないでください。
- 問題が複数ある場合は、一番時間を取られているもの1つに絞ってください（他は簡単にメモ程度に）。
- 話が脱線したら、やさしく本題に戻してください。
- 10分を過ぎそうなら、残りの項目を短く確認して要約に進んでください。
- Never invent facts. If something is unclear, ask once; if still unclear, move on.
```

### 2.3 Data collection fields (interview agent)

In the agent → **Analysis** → **Data collection** → **Add item**. Use these exact identifiers and types, and paste the description.

| Identifier | Type | Description to paste |
|---|---|---|
| `business_name` | String | The name of the owner's shop or business, as they said it (Japanese is fine). Not the owner's personal name. |
| `industry` | String | The type of business in a few words, preferably in Japanese, e.g. ラーメン店, 旅館, 居酒屋, 除雪業, 花屋, 介護事業所. |
| `city` | String | The city/town/village where the business is located, e.g. 札幌 or Sapporo. City name only, no street address. |
| `ward` | String | The ward or district inside the city (e.g. 中央区), if mentioned. Empty string if not mentioned. |
| `problem` | String | The main time-consuming task or problem the owner wants solved, in 1–4 sentences: what it is, how often, and why it is hard. Write it in the language the owner used. No personal data. |
| `current_process` | String | How the task is done today: who does it, with which tools, and the steps. 1–4 sentences. No personal data. |
| `desired_outcome` | String | What the owner wants instead: what "solved" looks like for them. 1–3 sentences. |
| `tools_used` | String | Comma-separated list of tools currently used for this task, e.g. "紙の台帳, 電話, Excel, LINE". Empty string if none. |
| `hours_lost_per_week` | Number | Approximate hours per week the owner spends on this task, converted to a weekly number (e.g. 1 hour per day, 6 days a week = 6). Number only. |
| `data_sensitivity` | String | Exactly one of: "public" (real data can be shared with students), "private" (real data cannot be shared), "synthetic_ok" (real data cannot be shared but realistic fictional stand-in data is fine). Use "synthetic_ok" if unsure. |
| `preferred_language` | String | Exactly "ja" or "en": the language the owner prefers for the brief and contact. Use "ja" if unsure. |

Notes on parsing (so you know what is forgiving): `business_name`, `industry`, `city` and `problem` are required for a brief to be created. `tools_used` is split on commas (`,`, `、`, `，`), semicolons, `・` and new lines. `hours_lost_per_week` accepts numbers inside text and is rounded. An unknown `data_sensitivity` becomes `synthetic_ok`; anything not starting with "en" becomes `ja`.

## 3. Create the impact agent

Repeat the steps from section 2 with these differences:

- Name: `Yukikaki Impact Review`.
- Same voice and TTS model (`eleven_flash_v2_5`).
- Max conversation duration: about 300 seconds (5 min) for a ~3-minute review.
- Dynamic variables: declare `delivery_id` (and optionally `locale`).
- Copy the Agent ID into `ELEVENLABS_IMPACT_AGENT_ID`.

### 3.1 First message

```
こんにちは。雪かきプロジェクトです。先日は学生チームのツールを導入していただき、ありがとうございました。
3分ほどで、使ってみたご感想を伺えますか？ English is fine too.
まず、そのツールのおかげで、1週間あたり何時間くらい作業が減りましたか？
```

### 3.2 System prompt

```
# あなたについて / Who you are
あなたは「雪かきプロジェクト（Project Yukikaki）」の効果確認インタビュー担当です。学生チームが事業者に納品したツール（自動化や仕組み）が、実際に役に立っているかを約3分で伺います。
You run a short impact review for Project Yukikaki: did the student team's solution actually help this business?

# 話し方 / Tone
- 日本語で、丁寧な敬語（です・ます調）、温かく、短く話してください。質問は一度に1つ。
- 相手が英語を希望したら、自然で丁寧な英語に切り替えてください。
- 良い点も悪い点も、正直に話してもらえるよう安心感を伝えてください（「率直なご意見が、次の改善に役立ちます」）。
- これは音声通話です。箇条書き・番号・記号や項目名は読み上げず、自然な話し言葉で話してください。「『はい』か『いいえ』でお答えください」のような機械的な言い方は避けてください。
- Keep it brief, warm and honest. Switch to English if the owner prefers. Voice call: no lists, symbols or field names.

# 文脈 / Context
- delivery_id: {{delivery_id}} — 内部用です。読み上げないでください。Internal only; never read it aloud.

# 聞くこと / Collect (about 3 minutes)
1. 1週間あたり、何時間くらい作業が減ったか（hours_saved_per_week）。1日単位で答えた場合は「週に何日くらいですか？」と日数を聞いてから（推測で日数を仮定しない）、1か月単位なら4で割って、週あたり1つの数字に換算して確認してください。減っていなければ0です。
2. 満足度を1〜5で（satisfaction）。5がとても満足、1がとても不満。
3. 今もそのツールを使っているか（still_in_use）：はい / いいえ。
4. 困っていること、不具合、改善してほしい点（issues）。なければ「特になし」。
5. 他の事業者にもこのプログラムを勧めたいか（would_recommend）：はい / いいえ。
6. 公開してもよい一言の感想（quote）。「この一言をプログラムの紹介に使ってもよろしいですか？」と確認してください。個人名は含めないでください。

# 進め方 / Flow
- 上の順で聞き、最後に内容を2〜3文の自然な文章で短く要約して確認し、お礼を伝えて終了してください。
- 学生チームへの不満があっても、反論や弁解はせず、受け止めて記録してください。
- 個人情報は聞かないでください。
- 3分を過ぎそうなら、残りを手短に確認して終了してください。
```

### 3.3 Data collection fields (impact agent)

| Identifier | Type | Description to paste |
|---|---|---|
| `hours_saved_per_week` | Number | Approximate hours per week the solution saves the owner, converted to a weekly number. 0 if it saves nothing. Number only. |
| `satisfaction` | Number | Owner's satisfaction from 1 (very unhappy) to 5 (very happy). Integer only. |
| `still_in_use` | Boolean | true if the owner still uses the delivered solution, false if they stopped. |
| `issues` | String | Problems, bugs or improvement requests the owner mentioned, in 1–3 sentences. Empty string if none. |
| `would_recommend` | Boolean | true if the owner would recommend the Yukikaki program to other businesses, otherwise false. |
| `quote` | String | One short sentence from the owner that they agreed can be shared publicly. No personal names. Empty string if they did not agree. |

The voice review is attached to the owner's evaluation (by conversation id, or by the `delivery_id` dynamic variable). The written questionnaire on the feedback page remains the official answer; the voice review adds the transcript and summary.

## 4. Dynamic variables

The browser starts each session with dynamic variables. In each agent, declare them (Agent → **Dynamic variables**, or simply reference them as `{{name}}` in the prompt and give a placeholder/default value for testing in the dashboard).

| Agent | Variable | Value sent by the app |
|---|---|---|
| Interview | `{{user_id}}` | Our internal user id of the signed-in owner |
| Interview | `{{business_id}}` | Our internal business id (may be empty for a first interview) |
| Interview | `{{locale}}` | `ja` or `en` (the UI language) |
| Impact | `{{delivery_id}}` | The delivery being reviewed |

These come back to our server in `conversation_initiation_client_data.dynamic_variables`, which is how a conversation is linked to the right user, business or delivery. Do not read them aloud — the prompts above say so.

## 5. Post-call webhook (production)

Locally you do **not** need a webhook: when a session ends, the browser posts the conversation id to `/api/interviews/complete`, and the server polls ElevenLabs until the analysis is `done`.

In production, also set up the webhook so briefs are created even if the owner closes the browser:

1. In ElevenLabs, open **Agents** → **Settings** (workspace agent settings) → **Post-call webhook** (or **Webhooks**) → **Create webhook**.
2. URL: `${APP_URL}/api/webhooks/elevenlabs`, e.g. `https://yukikaki.example.jp/api/webhooks/elevenlabs`.
3. Authentication: HMAC. Copy the generated **secret** and put it in `ELEVENLABS_WEBHOOK_SECRET`.
4. Enable the **transcription** event (`post_call_transcription`). Audio events are not needed.
5. Make sure both agents use this webhook (it is a workspace-level setting; if your dashboard has a per-agent override, keep it on the workspace webhook).
6. Redeploy so the new env var is picked up.

The server verifies the `ElevenLabs-Signature: t=…,v0=…` header (HMAC-SHA256 of `{t}.{raw body}`, 30-minute tolerance), then routes by `agent_id`: interview agent → create/update a brief, impact agent → attach to the evaluation. Both the webhook and the browser path are idempotent on `conversation_id`, so receiving both is safe.

## 6. Test it

1. Fill in `ELEVENLABS_API_KEY` and both agent IDs in `.env.local` and restart `pnpm dev`.
2. Sign in as a business owner and open `/ja/interview`. You should see the voice button instead of the text form.
3. Do a short interview. After you end it, the brief appears (it can take up to about a minute for ElevenLabs to finish analysis).
4. In the ElevenLabs dashboard, open the conversation → **Analysis** to check that every data collection field was filled.
5. `pnpm check:services` should show `✓ elevenlabs  interview agent ok, impact agent ok`.
