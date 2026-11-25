import "./load-env";
import { reviewBrief, reviewTeam } from "@/lib/integrations/dify";

/**
 * `pnpm smoke:dify` — runs both published Dify workflows once with a demo brief
 * (uses a few Dify credits). Confirms the keys, the DSL, and the app's parser agree.
 */
async function main() {
  const content = {
    ja: {
      title: "予約対応",
      problem: "札幌のラーメン店。電話とLINEの予約対応に週6時間。常連の田中花子さん(090-1234-5678)からの予約も手書き。",
      current_process: "紙のノート",
      desired_outcome: "LINEで自動受付",
    },
    en: { title: "", problem: "", current_process: "", desired_outcome: "" },
  };
  const t0 = Date.now();
  const brief = await reviewBrief({
    content,
    transcript: "Owner: 予約の電話とLINEで毎週6時間かかります。",
    sources: "[1] 札幌市 飲食店営業許可 — https://www.city.sapporo.jp/s394/11943.html\n札幌市の飲食店に関する統計",
    groundingLevel: "exact",
    meta: JSON.stringify({ business: "麺屋ゆき", city: "Sapporo", industry: "ramen", hours_lost_per_week: 6 }),
  });
  console.log(`✓ brief review (${((Date.now() - t0) / 1000).toFixed(1)}s):`, JSON.stringify(brief, null, 1));
  if (process.argv.includes("--brief-only")) return;
  const t1 = Date.now();
  const team = await reviewTeam({
    brief: JSON.stringify({ title: "Automate reservations", problem: "6h/week on phone and LINE bookings", skills_needed: ["line-bot", "booking-automation"] }),
    team: JSON.stringify({ name: "Snow Shovelers", pitch: "LINE official account auto-reply bot that writes bookings to a Google Sheet; 3 weeks." }),
    members: JSON.stringify([
      { name: "Haruto", role: "lead", skills: ["line-bot", "ai-automation"] },
      { name: "Yui", role: "member", skills: ["booking-automation", "spreadsheets"] },
    ]),
  });
  console.log(`✓ team review (${((Date.now() - t1) / 1000).toFixed(1)}s):`, JSON.stringify(team));
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
