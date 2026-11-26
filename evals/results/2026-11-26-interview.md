# Eval: interview — PASS

Run 2026-11-26T03:27:12.450Z · 49 s · 3 cases

| metric | value | threshold | result |
|---|---|---|---|
| schema_parse (briefDraftSchema) | 1 | ≥ 1 | pass |
| strict_fields (all 11 present & typed) | 1 | ≥ 0.66 | pass |
| hours_within_20pct | 1 | ≥ 0.66 | pass |
| industry_correct | 1 | ≥ 0.66 | pass |
| city_correct | 1 | ≥ 1 | pass |

## Cases

| case | pass | details |
|---|---|---|
| bakery-hakodate | ✓ | {"conversation":"conv_5601m8ay9c2menhrt4n5p4tax5ek","hours":3,"truthHours":3,"industry":"パン屋","industryKey":"bakery","city":"函館","problems":[]} |
| guesthouse-otaru | ✓ | {"conversation":"conv_0901m8ay9bphfpfbqjz31srj0zhf","hours":4,"truthHours":4,"industry":"ゲストハウス","industryKey":"guesthouse","city":"小樽市","problems":[]} |
| ramen-sapporo | ✓ | {"conversation":"conv_2301m8ay9bwxfk3vm9gzr9hj1qyt","hours":6,"truthHours":6,"industry":"ラーメン店","industryKey":"ramen","city":"札幌","problems":[]} |
