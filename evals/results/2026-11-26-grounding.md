# Eval: grounding — FAIL

Run 2026-11-26T06:24:26.736Z · 8 s · 8 cases

| metric | value | threshold | result |
|---|---|---|---|
| official_domains_only (pairs) | 1 | ≥ 1 | pass |
| city_or_analog_match (pairs) | 1 | ≥ 1 | pass |
| at_least_2_sources (pairs) | 1 | ≥ 0.875 | pass |
| precision_proxy (sources official ∧ city-consistent ∧ on-topic) | 0.479 | ≥ 0.6 | **FAIL** |

## Cases

| case | pass | details |
|---|---|---|
| Sapporo / ramen | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.sapporo.jp/toukei/tokeisyo/06commercer3.html","https://www.city.sapporo.jp/toukei/"],"nonOfficial":[],"wrongCity":[]} |
| Otaru / guesthouse | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.otaru.lg.jp/categories/bunya/about/opendata/","https://www.city.otaru.lg.jp/docs/2020120200171/","https://www.city.otaru.lg.jp/soshiki/sougouseisaku/kikaku/kikakutoukei/more.html","https://www.city.otaru.lg.jp/docs/2022070700084/","https://www.city.otaru.lg.jp/categories/kubun/opendata/"],"nonOfficial":[],"wrongCity":[]} |
| Asahikawa / construction | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.asahikawa.hokkaido.jp/700/jouhouseisaku/jouhouseisaku004/d054760.html","https://www.city.asahikawa.hokkaido.jp/500/501/502/d054512.html","https://www.city.asahikawa.hokkaido.jp/500/562/work204/index.html","https://www.city.asahikawa.hokkaido.jp/700/jouhouseisaku/jouhouseisaku004/d061839.html","https://www.city.asahikawa.hokkaido.jp/700/701 |
| Hakodate / bakery | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.hakodate.hokkaido.jp/docs/2016072200055/","https://www.harp.lg.jp/opendata/dataset/1604.html","https://www.harp.lg.jp/opendata/dataset/1729.html","https://www.harp.lg.jp/opendata/dataset/79.html","https://www.city.hakodate.hokkaido.jp/tag/%E3%82%AA%E3%83%BC%E3%83%97%E3%83%B3%E3%83%87%E3%83%BC%E3%82%BF","https://joruri-cms.city.hakodate.hok |
| Obihiro / farm | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.obihiro.hokkaido.jp/shisei/seisaku/toshi/opendata/1006509/index.html","https://www.city.obihiro.hokkaido.jp/shisei/seisaku/toshi/opendata/index.html","https://www.city.obihiro.hokkaido.jp/_res/projects/default_project/_page_/001/001/447/001.pdf"],"nonOfficial":[],"wrongCity":[]} |
| Aomori / care | ✓ | {"level":"exact","sources":6,"offTopic":["https://opendata.pref.aomori.lg.jp/dataset/1699.html"],"nonOfficial":[],"wrongCity":[]} |
| Akita / brewery | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.akita.lg.jp/opendata/","https://www.pref.akita.lg.jp/pages/archive/32419"],"nonOfficial":[],"wrongCity":[]} |
| Sapporo / snow_removal | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
