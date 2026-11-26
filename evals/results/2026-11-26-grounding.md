# Eval: grounding — FAIL

Run 2026-11-26T03:26:13.238Z · 10 s · 8 cases

| metric | value | threshold | result |
|---|---|---|---|
| official_domains_only (pairs) | 1 | ≥ 1 | pass |
| city_or_analog_match (pairs) | 1 | ≥ 1 | pass |
| at_least_2_sources (pairs) | 1 | ≥ 0.875 | pass |
| precision_proxy (sources official ∧ city-consistent ∧ on-topic) | 0.5 | ≥ 0.6 | **FAIL** |

## Cases

| case | pass | details |
|---|---|---|
| Sapporo / ramen | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.sapporo.jp/toukei/tokeisyo/06commercer3.html","https://www.city.sapporo.jp/toukei/"],"nonOfficial":[],"wrongCity":[]} |
| Otaru / guesthouse | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.otaru.lg.jp/docs/2022070700084/","https://www.city.otaru.lg.jp/docs/2022060600028","https://www.city.otaru.lg.jp/soshiki/sougouseisaku/kikaku/kikakutoukei/more.html","https://www.city.otaru.lg.jp/categories/kubun/opendata/","https://www.city.otaru.lg.jp/categories/bunya/about/opendata/"],"nonOfficial":[],"wrongCity":[]} |
| Asahikawa / construction | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.asahikawa.hokkaido.jp/700/jouhouseisaku/jouhouseisaku004/d054760.html","https://www.city.asahikawa.hokkaido.jp/500/562/work204/index.html","https://www.city.asahikawa.hokkaido.jp/700/jouhouseisaku/jouhouseisaku004/d061839.html","https://www.city.asahikawa.hokkaido.jp/500/501/502/d054512.html","https://www.city.asahikawa.hokkaido.jp/700/701 |
| Hakodate / bakery | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.hakodate.hokkaido.jp/docs/2016072200055/","https://www.harp.lg.jp/opendata/dataset/1729.html","https://www.harp.lg.jp/opendata/dataset/1604.html","https://www.city.hakodate.hokkaido.jp/docs/2015081200063","https://www.harp.lg.jp/opendata/dataset/79.html","https://www.harp.lg.jp/opendata/dataset/search/?s%5Barea_id%5D=31&s%5Bcategory_id%5D= |
| Obihiro / farm | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.obihiro.hokkaido.jp/shisei/seisaku/toshi/opendata/1006509/index.html","https://www.city.obihiro.hokkaido.jp/shisei/seisaku/toshi/opendata/index.html","https://www.city.obihiro.hokkaido.jp/_res/projects/default_project/_page_/001/001/447/001.pdf","https://www.city.obihiro.hokkaido.jp/_res/projects/default_project/_page_/001/009/169/all57.pd |
| Aomori / care | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
| Akita / brewery | ✓ | {"level":"exact","sources":6,"offTopic":["https://www.city.akita.lg.jp/kurashi/kenko/1005368/1010019/1017339.html","https://www.city.akita.lg.jp/opendata/"],"nonOfficial":[],"wrongCity":[]} |
| Sapporo / snow_removal | ✓ | {"level":"exact","sources":6,"offTopic":[],"nonOfficial":[],"wrongCity":[]} |
