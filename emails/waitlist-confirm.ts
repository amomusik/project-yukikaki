import type { RoadmapFeature } from "@/lib/party";

/** Roadmap waitlist confirmation (coming-soon features). Plain HTML, signer's locale first. */
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const NAMES: Record<RoadmapFeature, { en: string; ja: string }> = {
  team: { en: "Bring any team: AI helper robots fill in the missing roles", ja: "どんなチームでも：足りない役をAIの仲間（お手伝いロボット）が埋める" },
  pm: { en: "Virtual product manager: an AI PM that asks everyone “what's next?”", ja: "AIプロダクトマネージャー：一人ひとりに「次は何をする？」と問いかける" },
  points: { en: "Points & rewards: earn points and badges for taking part", ja: "ポイントと特典：参加や納品でポイントとバッジがたまる" },
};

export function waitlistConfirmEmail(i: { locale: "ja" | "en"; org?: string | null; features: RoadmapFeature[]; appUrl: string }) {
  const org = i.org ? escape(i.org) : null;
  const link = escape(i.appUrl.replace(/\/$/, "") + `/${i.locale}`);
  const list = (l: "en" | "ja") => `<ul>${i.features.map((f) => `<li>${escape(NAMES[f][l])}</li>`).join("")}</ul>`;
  const subject = i.locale === "ja" ? "【雪かき】近日公開機能のウェイトリストに登録しました" : "Yukikaki: you're on the waitlist for upcoming features";
  const ja = `<p>ウェイトリストへのご登録ありがとうございます${org ? `（${org}）` : ""}。</p>
<p>以下の機能は<strong>近日公開</strong>予定で、現時点ではまだご利用いただけません。</p>
${list("ja")}
<p>公開の準備ができたら、このアドレスにお知らせします。AIは提案するだけで、決めるのはいつも人です。</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none">雪かきを見る</a></p>
<p style="color:#64748b;font-size:12px">心当たりがない場合は、このメールを無視してください。</p>`;
  const en = `<p>Thanks for joining the waitlist${org ? ` (${org})` : ""}.</p>
<p>These features are <strong>coming soon</strong> and aren't available yet:</p>
${list("en")}
<p>We'll email this address when they're ready. The AI only proposes; people always decide.</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none">Visit Yukikaki</a></p>
<p style="color:#64748b;font-size:12px">If you didn't sign up, you can ignore this email.</p>`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto">${i.locale === "ja" ? ja + "<hr/>" + en : en + "<hr/>" + ja}</div>`;
  const items = (l: "en" | "ja") => i.features.map((f) => `- ${NAMES[f][l]}`).join("\n");
  const text =
    i.locale === "ja"
      ? `ウェイトリストへのご登録ありがとうございます。以下は近日公開予定で、まだご利用いただけません。\n${items("ja")}\n準備ができたらお知らせします。`
      : `Thanks for joining the waitlist. These are coming soon and aren't available yet:\n${items("en")}\nWe'll email you when they're ready.`;
  return { subject, html, text };
}
