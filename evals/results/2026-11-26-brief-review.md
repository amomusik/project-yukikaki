# Eval: brief-review — FAIL

Run 2026-11-26T03:25:03.967Z · 69 s · 12 cases

| metric | value | threshold | result |
|---|---|---|---|
| json_validity | 1 | ≥ 0.95 | pass |
| pii_recall (detected & nothing leaked) | 1 | ≥ 0.9 | pass |
| pii_false_positive_rate | 0 | ≤ 0.15 | pass |
| recommendation_accuracy | 1 | ≥ 0.75 | pass |
| business_name_preservation | 0.778 | ≥ 0.85 | **FAIL** — rescored offline: 14/18 runs where the business name appears in the brief text (3 meta-only cases excluded) |
| stability (same recommendation across runs) | 1 | ≥ 0.75 | pass |

## Cases

| case | pass | details |
|---|---|---|
| good-ramen (good brief) | ✗ | {"expect":["approve"],"runs":[{"run":1,"rec":"approve","score":91,"pii_found":false,"leaks":[],"name_kept":false,"en_title":"Automating Reservation Management"},{"run":2,"rec":"approve","score":91,"pii_found":false,"leaks":[],"name_kept":false,"en_title":"Automating Reservation Management"}]} |
| pii-name-phone (PII (name + phone)) | ✓ | {"expect":["revise"],"runs":[{"run":1,"rec":"revise","score":91,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Regular Customer Reservation Management"},{"run":2,"rec":"revise","score":91,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Managing Reservations for Regular Customers"}]} |
| pii-email (PII (guest email)) | ✓ | {"expect":["revise"],"runs":[{"run":1,"rec":"revise","score":88,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Multilingual Email Responses"},{"run":2,"rec":"revise","score":91,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Multilingual Email Responses"}]} |
| mention-only (mention-only (no PII values)) | ✓ | {"expect":["approve"],"runs":[{"run":1,"rec":"approve","score":91,"pii_found":false,"leaks":[],"name_kept":true,"en_title":"Digitalization of Reservation Ledger"},{"run":2,"rec":"approve","score":88,"pii_found":false,"leaks":[],"name_kept":true,"en_title":"Digitalization of Reservation Ledger"}]} |
| romanized-name (romanized name) | ✓ | {"expect":["revise"],"runs":[{"run":1,"rec":"revise","score":91,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Supplier orders"},{"run":2,"rec":"revise","score":88,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Supplier orders"}]} |
| phone-variants (phone format variants) | ✓ | {"expect":["revise"],"runs":[{"run":1,"rec":"revise","score":91,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Organizing Delivery Orders"},{"run":2,"rec":"revise","score":91,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Organizing Delivery Orders"}]} |
| ungrounded (ungrounded) | ✗ | {"expect":["revise","reject"],"runs":[{"run":1,"rec":"revise","score":59,"pii_found":false,"leaks":[],"name_kept":"n/a","en_title":"Inventory Management"},{"run":2,"rec":"revise","score":59,"pii_found":false,"leaks":[],"name_kept":"n/a","en_title":"Inventory Management"}]} |
| national (national grounding only) | ✗ | {"expect":["approve","revise"],"runs":[{"run":1,"rec":"revise","score":73,"pii_found":false,"leaks":[],"name_kept":"n/a","en_title":"Streamlining Estimate Creation"},{"run":2,"rec":"revise","score":73,"pii_found":false,"leaks":[],"name_kept":"n/a","en_title":"Streamlining Estimate Creation"}]} |
| out-of-scope (out of scope (licensed professional + ERP)) | ✗ | {"expect":["revise","reject"],"runs":[{"run":1,"rec":"revise","score":46,"pii_found":false,"leaks":[],"name_kept":"n/a","en_title":"Tax Filing and Core System"},{"run":2,"rec":"revise","score":46,"pii_found":false,"leaks":[],"name_kept":"n/a","en_title":"Tax Filing and Core System"}]} |
| name-preservation (business name preservation) | ✗ | {"expect":["approve","revise"],"runs":[{"run":1,"rec":"approve","score":88,"pii_found":false,"leaks":[],"name_kept":false,"en_title":"Accommodation Tax Calculation"},{"run":2,"rec":"approve","score":88,"pii_found":false,"leaks":[],"name_kept":false,"en_title":"Accommodation Tax Calculation"}]} |
| pii-address (PII (home address)) | ✓ | {"expect":["revise"],"runs":[{"run":1,"rec":"revise","score":76,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Home Care Record Keeping"},{"run":2,"rec":"revise","score":76,"pii_found":true,"leaks":[],"name_kept":true,"en_title":"Home Care Record Keeping"}]} |
| good-bakery-en (good brief (English source)) | ✓ | {"expect":["approve"],"runs":[{"run":1,"rec":"approve","score":91,"pii_found":false,"leaks":[],"name_kept":true,"en_title":"Daily bake planning"},{"run":2,"rec":"approve","score":91,"pii_found":false,"leaks":[],"name_kept":true,"en_title":"Daily bake planning"}]} |
