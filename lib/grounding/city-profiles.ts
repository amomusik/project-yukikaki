/**
 * City trait table used to find "analog cities" when a city has no public data
 * for an industry. Values are approximate public figures (JMA climate normals,
 * census population, 65+ ratio) and are meant for similarity ranking only.
 *
 * Forking for your town? Add one row. That's it.
 */
export type CityProfile = {
  key: string; // stable lowercase id
  en: string;
  ja: string;
  prefecture: string;
  snowfallCm: number; // annual snowfall
  janTempC: number; // January mean temperature
  population: number;
  coastal: boolean;
  tourism: number; // 0 (none) … 1 (major destination)
  aging: number; // share of population 65+
  /** Official municipal web domain when it is not under lg.jp (lg.jp/go.jp are always searched). */
  site?: string;
};

export const CITY_PROFILES: CityProfile[] = [
  { key: "sapporo", en: "Sapporo", ja: "札幌", prefecture: "Hokkaido", snowfallCm: 479, janTempC: -3.2, population: 1_970_000, coastal: false, tourism: 0.8, aging: 0.28, site: "city.sapporo.jp" },
  { key: "asahikawa", en: "Asahikawa", ja: "旭川", prefecture: "Hokkaido", snowfallCm: 570, janTempC: -7.5, population: 325_000, coastal: false, tourism: 0.5, aging: 0.35, site: "city.asahikawa.hokkaido.jp" },
  { key: "otaru", en: "Otaru", ja: "小樽", prefecture: "Hokkaido", snowfallCm: 600, janTempC: -3.5, population: 108_000, coastal: true, tourism: 0.9, aging: 0.42 },
  { key: "hakodate", en: "Hakodate", ja: "函館", prefecture: "Hokkaido", snowfallCm: 290, janTempC: -2.4, population: 245_000, coastal: true, tourism: 0.8, aging: 0.37, site: "city.hakodate.hokkaido.jp" },
  { key: "obihiro", en: "Obihiro", ja: "帯広", prefecture: "Hokkaido", snowfallCm: 200, janTempC: -7.4, population: 165_000, coastal: false, tourism: 0.3, aging: 0.3, site: "city.obihiro.hokkaido.jp" },
  { key: "aomori", en: "Aomori", ja: "青森", prefecture: "Aomori", snowfallCm: 567, janTempC: -0.9, population: 270_000, coastal: true, tourism: 0.5, aging: 0.34, site: "city.aomori.aomori.jp" },
  { key: "akita", en: "Akita", ja: "秋田", prefecture: "Akita", snowfallCm: 270, janTempC: 0.4, population: 300_000, coastal: true, tourism: 0.4, aging: 0.35 },
  { key: "morioka", en: "Morioka", ja: "盛岡", prefecture: "Iwate", snowfallCm: 200, janTempC: -1.6, population: 280_000, coastal: false, tourism: 0.4, aging: 0.31 },
  { key: "yamagata", en: "Yamagata", ja: "山形", prefecture: "Yamagata", snowfallCm: 230, janTempC: -0.4, population: 240_000, coastal: false, tourism: 0.4, aging: 0.31 },
  { key: "sendai", en: "Sendai", ja: "仙台", prefecture: "Miyagi", snowfallCm: 60, janTempC: 1.6, population: 1_090_000, coastal: true, tourism: 0.5, aging: 0.25 },
  { key: "niigata", en: "Niigata", ja: "新潟", prefecture: "Niigata", snowfallCm: 100, janTempC: 2.9, population: 770_000, coastal: true, tourism: 0.4, aging: 0.31 },
  { key: "nagano", en: "Nagano", ja: "長野", prefecture: "Nagano", snowfallCm: 190, janTempC: -0.6, population: 370_000, coastal: false, tourism: 0.6, aging: 0.31 },
  { key: "takayama", en: "Takayama", ja: "高山", prefecture: "Gifu", snowfallCm: 290, janTempC: -1.4, population: 85_000, coastal: false, tourism: 0.9, aging: 0.35 },
  { key: "toyama", en: "Toyama", ja: "富山", prefecture: "Toyama", snowfallCm: 300, janTempC: 3.0, population: 410_000, coastal: true, tourism: 0.4, aging: 0.31 },
  { key: "kanazawa", en: "Kanazawa", ja: "金沢", prefecture: "Ishikawa", snowfallCm: 160, janTempC: 4.0, population: 460_000, coastal: true, tourism: 0.8, aging: 0.28 },
  { key: "fukui", en: "Fukui", ja: "福井", prefecture: "Fukui", snowfallCm: 230, janTempC: 3.0, population: 255_000, coastal: false, tourism: 0.3, aging: 0.3 },
  { key: "setagaya", en: "Setagaya", ja: "世田谷", prefecture: "Tokyo", snowfallCm: 10, janTempC: 5.4, population: 940_000, coastal: false, tourism: 0.3, aging: 0.2 },
  { key: "yokohama", en: "Yokohama", ja: "横浜", prefecture: "Kanagawa", snowfallCm: 10, janTempC: 6.0, population: 3_770_000, coastal: true, tourism: 0.6, aging: 0.25 },
  { key: "nagoya", en: "Nagoya", ja: "名古屋", prefecture: "Aichi", snowfallCm: 10, janTempC: 4.8, population: 2_330_000, coastal: true, tourism: 0.5, aging: 0.25 },
  { key: "kyoto", en: "Kyoto", ja: "京都", prefecture: "Kyoto", snowfallCm: 20, janTempC: 4.8, population: 1_460_000, coastal: false, tourism: 1.0, aging: 0.29 },
  { key: "osaka", en: "Osaka", ja: "大阪", prefecture: "Osaka", snowfallCm: 5, janTempC: 6.2, population: 2_750_000, coastal: true, tourism: 0.8, aging: 0.25 },
  { key: "kobe", en: "Kobe", ja: "神戸", prefecture: "Hyogo", snowfallCm: 5, janTempC: 6.0, population: 1_510_000, coastal: true, tourism: 0.6, aging: 0.29 },
  { key: "hiroshima", en: "Hiroshima", ja: "広島", prefecture: "Hiroshima", snowfallCm: 10, janTempC: 5.4, population: 1_190_000, coastal: true, tourism: 0.6, aging: 0.26 },
  { key: "matsuyama", en: "Matsuyama", ja: "松山", prefecture: "Ehime", snowfallCm: 2, janTempC: 6.3, population: 505_000, coastal: true, tourism: 0.5, aging: 0.3 },
  { key: "fukuoka", en: "Fukuoka", ja: "福岡", prefecture: "Fukuoka", snowfallCm: 5, janTempC: 6.9, population: 1_640_000, coastal: true, tourism: 0.6, aging: 0.22 },
  { key: "kagoshima", en: "Kagoshima", ja: "鹿児島", prefecture: "Kagoshima", snowfallCm: 5, janTempC: 8.7, population: 590_000, coastal: true, tourism: 0.6, aging: 0.28 },
  { key: "naha", en: "Naha", ja: "那覇", prefecture: "Okinawa", snowfallCm: 0, janTempC: 17.3, population: 317_000, coastal: true, tourism: 0.9, aging: 0.22 },
];

const WEIGHTS = { snow: 3, temp: 2, pop: 1.5, coastal: 0.5, tourism: 1, aging: 1 };

function ranges() {
  const r = (f: (c: CityProfile) => number) => {
    const v = CITY_PROFILES.map(f);
    return Math.max(...v) - Math.min(...v) || 1;
  };
  return {
    snow: r((c) => c.snowfallCm),
    temp: r((c) => c.janTempC),
    pop: r((c) => Math.log10(c.population)),
    tourism: r((c) => c.tourism),
    aging: r((c) => c.aging),
  };
}

export function findCity(name: string | null | undefined): CityProfile | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase().replace(/[市区町村]$/u, "").replace(/-?(shi|ku|city)$/u, "").trim();
  return CITY_PROFILES.find((c) => c.key === n || c.en.toLowerCase() === n || c.ja === n || name.includes(c.ja));
}

export function cityDistance(a: CityProfile, b: CityProfile): number {
  const R = ranges();
  const d = (x: number, y: number, range: number) => Math.abs(x - y) / range;
  return (
    WEIGHTS.snow * d(a.snowfallCm, b.snowfallCm, R.snow) +
    WEIGHTS.temp * d(a.janTempC, b.janTempC, R.temp) +
    WEIGHTS.pop * d(Math.log10(a.population), Math.log10(b.population), R.pop) +
    WEIGHTS.coastal * (a.coastal === b.coastal ? 0 : 1) +
    WEIGHTS.tourism * d(a.tourism, b.tourism, R.tourism) +
    WEIGHTS.aging * d(a.aging, b.aging, R.aging)
  );
}

/** Most physically/economically similar cities, closest first. */
export function analogCities(city: string, n = 3): CityProfile[] {
  const base = findCity(city);
  if (!base) return [];
  return CITY_PROFILES.filter((c) => c.key !== base.key)
    .map((c) => ({ c, dist: cityDistance(base, c) }))
    .sort((x, y) => x.dist - y.dist)
    .slice(0, n)
    .map((x) => x.c);
}
