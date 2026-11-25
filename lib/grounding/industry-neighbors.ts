/**
 * Industry vocabulary: canonical key → Japanese search term, aliases, and
 * adjacent industries used when a city has no data for the exact industry.
 */
export type Industry = { key: string; ja: string; en: string; aliases: string[]; neighbors: string[] };

export const INDUSTRIES: Industry[] = [
  { key: "ramen", ja: "ラーメン店", en: "ramen shop", aliases: ["ラーメン", "らーめん", "noodle shop"], neighbors: ["soba", "izakaya", "restaurant"] },
  { key: "soba", ja: "そば店", en: "soba restaurant", aliases: ["蕎麦", "そば", "うどん", "udon"], neighbors: ["ramen", "restaurant"] },
  { key: "izakaya", ja: "居酒屋", en: "izakaya", aliases: ["居酒屋", "bar", "pub"], neighbors: ["restaurant", "ramen"] },
  { key: "restaurant", ja: "飲食店", en: "restaurant", aliases: ["飲食", "食堂", "レストラン", "diner"], neighbors: ["izakaya", "cafe"] },
  { key: "cafe", ja: "喫茶店", en: "cafe", aliases: ["カフェ", "喫茶", "coffee"], neighbors: ["bakery", "restaurant"] },
  { key: "bakery", ja: "パン屋", en: "bakery", aliases: ["パン", "ベーカリー", "和菓子", "confectionery"], neighbors: ["cafe", "retail"] },
  { key: "ryokan", ja: "旅館", en: "ryokan (inn)", aliases: ["旅館", "inn", "hotel", "ホテル"], neighbors: ["minshuku", "guesthouse"] },
  { key: "minshuku", ja: "民宿", en: "minshuku", aliases: ["民宿", "ペンション"], neighbors: ["ryokan", "guesthouse"] },
  { key: "guesthouse", ja: "ゲストハウス", en: "guesthouse", aliases: ["ゲストハウス", "hostel", "民泊"], neighbors: ["minshuku", "ryokan"] },
  { key: "retail", ja: "小売店", en: "retail shop", aliases: ["商店", "雑貨", "shop", "store"], neighbors: ["bakery", "hardware"] },
  { key: "hardware", ja: "金物店", en: "hardware store", aliases: ["金物", "ホームセンター", "工具"], neighbors: ["retail"] },
  { key: "florist", ja: "花屋", en: "florist", aliases: ["花屋", "生花"], neighbors: ["retail"] },
  { key: "salon", ja: "美容室", en: "hair salon", aliases: ["美容院", "理容", "barber"], neighbors: ["retail"] },
  { key: "clinic", ja: "診療所", en: "clinic", aliases: ["クリニック", "整骨院", "歯科"], neighbors: ["care"] },
  { key: "care", ja: "介護事業所", en: "elder care", aliases: ["介護", "デイサービス"], neighbors: ["clinic"] },
  { key: "farm", ja: "農家", en: "farm", aliases: ["農業", "農園", "agriculture"], neighbors: ["food_processing"] },
  { key: "fishery", ja: "漁業", en: "fishery", aliases: ["漁協", "水産", "fishing"], neighbors: ["food_processing"] },
  { key: "food_processing", ja: "食品加工", en: "food processing", aliases: ["加工", "惣菜", "味噌", "醤油"], neighbors: ["farm", "brewery"] },
  { key: "brewery", ja: "酒蔵", en: "sake brewery", aliases: ["酒造", "醸造", "brewery", "sake"], neighbors: ["food_processing"] },
  { key: "snow_removal", ja: "除雪業", en: "snow removal", aliases: ["除雪", "雪かき", "排雪", "snow"], neighbors: ["construction"] },
  { key: "construction", ja: "工務店", en: "construction", aliases: ["建設", "リフォーム", "builder"], neighbors: ["snow_removal", "hardware"] },
  { key: "taxi", ja: "タクシー", en: "taxi", aliases: ["タクシー", "運送", "transport"], neighbors: ["construction"] },
];

export function findIndustry(input: string | null | undefined): Industry | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  return (
    INDUSTRIES.find((i) => i.key === s || i.en.toLowerCase() === s || i.ja === input.trim()) ??
    INDUSTRIES.find((i) => [i.ja, i.en.toLowerCase(), ...i.aliases.map((a) => a.toLowerCase())].some((a) => s.includes(a)))
  );
}

/** Canonical key, or the normalised input when the industry isn't in the table. */
export function industryKey(input: string): string {
  return findIndustry(input)?.key ?? input.trim().toLowerCase().replace(/\s+/g, "_");
}

export function industryNeighbors(input: string): Industry[] {
  const ind = findIndustry(input);
  if (!ind) return [];
  return ind.neighbors.map((k) => INDUSTRIES.find((i) => i.key === k)).filter((i): i is Industry => Boolean(i));
}

export function industryJa(input: string): string {
  return findIndustry(input)?.ja ?? input;
}
