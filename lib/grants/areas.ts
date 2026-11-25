/**
 * Prefecture vocabulary for jGrants `target_area_search` (values from the official
 * OpenAPI enum). city-profiles.ts stores prefectures in English; jGrants uses Japanese
 * prefecture names plus regional groupings and 全国 (nationwide).
 */
export type Prefecture = { en: string; ja: string; region: string };

export const NATIONWIDE = "全国";

export const PREFECTURES: Prefecture[] = [
  { en: "Hokkaido", ja: "北海道", region: "北海道地方" },
  { en: "Aomori", ja: "青森県", region: "東北地方" },
  { en: "Iwate", ja: "岩手県", region: "東北地方" },
  { en: "Miyagi", ja: "宮城県", region: "東北地方" },
  { en: "Akita", ja: "秋田県", region: "東北地方" },
  { en: "Yamagata", ja: "山形県", region: "東北地方" },
  { en: "Fukushima", ja: "福島県", region: "東北地方" },
  { en: "Ibaraki", ja: "茨城県", region: "関東・甲信越地方" },
  { en: "Tochigi", ja: "栃木県", region: "関東・甲信越地方" },
  { en: "Gunma", ja: "群馬県", region: "関東・甲信越地方" },
  { en: "Saitama", ja: "埼玉県", region: "関東・甲信越地方" },
  { en: "Chiba", ja: "千葉県", region: "関東・甲信越地方" },
  { en: "Tokyo", ja: "東京都", region: "関東・甲信越地方" },
  { en: "Kanagawa", ja: "神奈川県", region: "関東・甲信越地方" },
  { en: "Niigata", ja: "新潟県", region: "関東・甲信越地方" },
  { en: "Yamanashi", ja: "山梨県", region: "関東・甲信越地方" },
  { en: "Nagano", ja: "長野県", region: "関東・甲信越地方" },
  { en: "Toyama", ja: "富山県", region: "東海・北陸地方" },
  { en: "Ishikawa", ja: "石川県", region: "東海・北陸地方" },
  { en: "Fukui", ja: "福井県", region: "東海・北陸地方" },
  { en: "Gifu", ja: "岐阜県", region: "東海・北陸地方" },
  { en: "Shizuoka", ja: "静岡県", region: "東海・北陸地方" },
  { en: "Aichi", ja: "愛知県", region: "東海・北陸地方" },
  { en: "Mie", ja: "三重県", region: "東海・北陸地方" },
  { en: "Shiga", ja: "滋賀県", region: "近畿地方" },
  { en: "Kyoto", ja: "京都府", region: "近畿地方" },
  { en: "Osaka", ja: "大阪府", region: "近畿地方" },
  { en: "Hyogo", ja: "兵庫県", region: "近畿地方" },
  { en: "Nara", ja: "奈良県", region: "近畿地方" },
  { en: "Wakayama", ja: "和歌山県", region: "近畿地方" },
  { en: "Tottori", ja: "鳥取県", region: "中国地方" },
  { en: "Shimane", ja: "島根県", region: "中国地方" },
  { en: "Okayama", ja: "岡山県", region: "中国地方" },
  { en: "Hiroshima", ja: "広島県", region: "中国地方" },
  { en: "Yamaguchi", ja: "山口県", region: "中国地方" },
  { en: "Tokushima", ja: "徳島県", region: "四国地方" },
  { en: "Kagawa", ja: "香川県", region: "四国地方" },
  { en: "Ehime", ja: "愛媛県", region: "四国地方" },
  { en: "Kochi", ja: "高知県", region: "四国地方" },
  { en: "Fukuoka", ja: "福岡県", region: "九州・沖縄地方" },
  { en: "Saga", ja: "佐賀県", region: "九州・沖縄地方" },
  { en: "Nagasaki", ja: "長崎県", region: "九州・沖縄地方" },
  { en: "Kumamoto", ja: "熊本県", region: "九州・沖縄地方" },
  { en: "Oita", ja: "大分県", region: "九州・沖縄地方" },
  { en: "Miyazaki", ja: "宮崎県", region: "九州・沖縄地方" },
  { en: "Kagoshima", ja: "鹿児島県", region: "九州・沖縄地方" },
  { en: "Okinawa", ja: "沖縄県", region: "九州・沖縄地方" },
];

/** Match an English or Japanese prefecture name ("Tokyo", "東京", "東京都"). */
export function findPrefecture(name: string | null | undefined): Prefecture | undefined {
  if (!name) return undefined;
  const n = name.trim();
  const lower = n.toLowerCase();
  return PREFECTURES.find(
    (p) => p.en.toLowerCase() === lower || p.ja === n || p.ja.replace(/[都府県]$/u, "") === n.replace(/[都府県]$/u, ""),
  );
}

/** jGrants joins multiple areas with " / ". */
export function splitAreas(area: string | null | undefined): string[] {
  return (area ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type AreaMatch = "prefecture" | "region" | "national" | null;

/**
 * Does a jGrants area string cover the given prefecture? Prefecture beats region beats
 * nationwide. With no known prefecture only nationwide programmes match.
 */
export function areaMatch(area: string | null | undefined, pref: Prefecture | undefined): AreaMatch {
  const parts = splitAreas(area);
  if (pref && parts.includes(pref.ja)) return "prefecture";
  if (pref && parts.includes(pref.region)) return "region";
  if (parts.includes(NATIONWIDE)) return "national";
  return null;
}
