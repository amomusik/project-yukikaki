/** Display helpers for grant matches (pure; shared by pages and tests). */

export function formatYen(amount: number | null | undefined, locale: string): string | null {
  if (!amount || amount <= 0) return null;
  if (locale === "ja") {
    if (amount >= 100_000_000) return `${(amount / 100_000_000).toLocaleString("ja-JP", { maximumFractionDigits: 2 })}億円`;
    if (amount >= 10_000) return `${(amount / 10_000).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}万円`;
    return `${amount.toLocaleString("ja-JP")}円`;
  }
  return `¥${amount.toLocaleString("en-US")}`;
}

/** YYYY-MM-DD in Japan time (deadlines are published in JST). */
export function formatDateJst(d: Date | null | undefined): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function daysLeft(d: Date | null | undefined, now = new Date()): number | null {
  if (!d) return null;
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
}

export function grantlineUrl(locale: string): string {
  return `https://grantline.foundrylabs.co.jp/${locale === "ja" ? "ja" : "en"}/grants`;
}
