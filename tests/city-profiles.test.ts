import { describe, expect, it } from "vitest";
import { analogCities, findCity } from "@/lib/grounding/city-profiles";

describe("analog cities", () => {
  it("matches Sapporo to snowy northern cities, never warm southern ones", () => {
    const analogs = analogCities("Sapporo", 3);
    expect(analogs).toHaveLength(3);
    for (const c of analogs) {
      expect(c.snowfallCm).toBeGreaterThan(150);
      expect(c.janTempC).toBeLessThan(2);
    }
    const keys = analogs.map((c) => c.key);
    expect(keys).not.toContain("naha");
    expect(keys).not.toContain("fukuoka");
    expect(keys.some((k) => ["asahikawa", "aomori", "akita", "otaru", "hakodate"].includes(k))).toBe(true);
  });

  it("finds cities by Japanese name or with a 市 suffix", () => {
    expect(findCity("札幌市")?.key).toBe("sapporo");
    expect(findCity("asahikawa")?.key).toBe("asahikawa");
    expect(findCity("Atlantis")).toBeUndefined();
  });

  it("returns nothing for unknown cities", () => {
    expect(analogCities("Atlantis")).toEqual([]);
  });
});
