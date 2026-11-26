# Eval: grounding — PASS

Run 2026-11-26T07:26:45.922Z · 34 s · 8 cases

| metric | value | threshold | result |
|---|---|---|---|
| official_domains_only (pairs) | 1 | ≥ 1 | pass |
| city_or_analog_match (pairs) | 1 | ≥ 1 | pass |
| at_least_2_sources (pairs) | 1 | ≥ 0.875 | pass |
| precision_proxy (sources official ∧ city-consistent ∧ on-topic) | 1 | ≥ 0.6 | pass |

## Cases

| case | pass | details |
|---|---|---|
| Sapporo / ramen | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
| Otaru / guesthouse | ✓ | {"level":"exact","sources":3,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
| Asahikawa / construction | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
| Hakodate / bakery | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
| Obihiro / farm | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
| Aomori / care | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
| Akita / brewery | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
| Sapporo / snow_removal | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
