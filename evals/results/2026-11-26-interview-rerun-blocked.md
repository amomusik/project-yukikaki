> Re-run at 15:26 JST blocked by ElevenLabs quota (0/10000 credits left). The scored interview result for today is the 12:27 JST live run in `2026-11-26-interview.json`.

# Eval: interview — FAIL

Run 2026-11-26T06:26:15.383Z · 25 s · 3 cases

| metric | value | threshold | result |
|---|---|---|---|
| schema_parse (briefDraftSchema) | 0 | ≥ 1 | **FAIL** |
| strict_fields (all 11 present & typed) | 0 | ≥ 0.66 | **FAIL** |
| hours_within_20pct | 0 | ≥ 0.66 | **FAIL** |
| industry_correct | 0 | ≥ 0.66 | **FAIL** |
| city_correct | 0 | ≥ 1 | **FAIL** |

## Cases

| case | pass | details |
|---|---|---|
| bakery-hakodate.json | ✗ | {"exit":1} |
| guesthouse-otaru.json | ✗ | {"exit":1} |
| ramen-sapporo.json | ✗ | {"exit":1} |

## Errors

- guesthouse-otaru.json: no result (exit 1): Owner: そうですね、よくある質問ばかりなので、それに対する返信の下書きが、お客様の言語で自動的に用意されていると本当に助かります。私たちはそれを確認して、送信ボタンを押すだけ、という風にできたら理想的ですね。 | Agent: よくある質問に対して、お客様の言語での返信下書きが自動で用意されていて、確認して送信するだけになれば、本当に便利ですね。  その作業で使っている道具についてですが、先ほどおっしゃっていたGmail、Booking.com、Airbnb、そしてGoogle翻訳のほかに、何か使っているツールやソフトはございますか？ | ✗ turn failed: This requ
- bakery-hakodate.json: no result (exit 1): Agent: 売上の記録と天気予報から、明日焼くパンの数の目安がパッと自動で出るようになれば、毎朝の負担がぐっと減って本当に助かりますよね。  ちなみに、その予測の目安を出すために、今使っている「紙のメモ」や「天気予報」のほかに、何か使っている道具やアプリなどはありますでしょうか？ | Owner: いえ、使っているのは紙の売上メモと、電卓と、あとはお店のレジくらいですね。ITのことはよくわからないので、特別なアプリなどは使っていないんですよ。 | ✗ turn failed: This request exceeds your quota of 10000. You have 0 credi
- ramen-sapporo.json: no result (exit 1): Owner: お客様の名前や電話番号とかはちょっと見せられないんですけど、架空のデータなら問題ないですよ。 | 個人情報に関わるものは、やっぱり難しいですね。 | ✗ turn failed: This request exceeds your quota of 10000. You have 0 credits remaining, while 30 credits are required for this request.
