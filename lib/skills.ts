/** Shared skill vocabulary for briefs (skills_needed) and students (skills). */
export const SKILLS = [
  "ai-automation",
  "spreadsheets",
  "line-bot",
  "booking-automation",
  "email-automation",
  "inventory",
  "bookkeeping",
  "social-media",
  "translation",
  "paperwork-automation",
  "web",
  "data-analysis",
] as const;
export type Skill = (typeof SKILLS)[number];

const RULES: [RegExp, Skill][] = [
  [/excel|スプレッドシート|spreadsheet|表計算|エクセル/i, "spreadsheets"],
  [/\bline\b|ライン/i, "line-bot"],
  [/予約|reservation|booking/i, "booking-automation"],
  [/メール|e-?mail|問い合わせ|inquir/i, "email-automation"],
  [/在庫|inventory|発注|stock/i, "inventory"],
  [/請求|invoice|会計|経理|帳簿|bookkeep|accounting|レシート/i, "bookkeeping"],
  [/sns|instagram|インスタ|social/i, "social-media"],
  [/翻訳|英語|translat|インバウンド|inbound|外国人/i, "translation"],
  [/申請|補助金|行政|書類|paperwork|form|届出|許可/i, "paperwork-automation"],
  [/ウェブ|website|ホームページ|\bweb\b/i, "web"],
  [/分析|集計|売上|analy|forecast|予測/i, "data-analysis"],
];

/** Fallback skill inference when Dify is unavailable. Always includes ai-automation. */
export function inferSkills(...texts: (string | string[] | null | undefined)[]): Skill[] {
  const hay = texts.flat().filter(Boolean).join(" ");
  const found = new Set<Skill>(["ai-automation"]);
  for (const [re, skill] of RULES) if (re.test(hay)) found.add(skill);
  return [...found];
}
