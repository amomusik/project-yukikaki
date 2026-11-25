import { findCity } from "@/lib/grounding/city-profiles";
import { findIndustry } from "@/lib/grounding/industry-neighbors";

/** Display names for stored city / industry keys in the active locale; unknown values pass through. */
export function cityLabel(city: string, lang: "en" | "ja"): string {
  const c = findCity(city);
  return c ? c[lang] : city;
}

export function industryLabel(industry: string, lang: "en" | "ja"): string {
  const i = findIndustry(industry);
  if (!i) return industry.replace(/_/g, " ");
  return lang === "ja" ? i.ja : i.en.charAt(0).toUpperCase() + i.en.slice(1);
}
