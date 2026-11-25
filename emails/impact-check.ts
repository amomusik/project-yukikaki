/** Bilingual impact-check email. Plain HTML so it renders everywhere without extra deps. */
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function impactCheckEmail(i: {
  link: string;
  businessName: string;
  teamName: string;
  leadName: string;
  locale: "ja" | "en";
}) {
  const b = escape(i.businessName);
  const t = escape(i.teamName);
  const l = escape(i.leadName);
  const link = escape(i.link);
  const subject =
    i.locale === "ja"
      ? `【雪かき】${i.businessName}様：導入したツールの効果を教えてください（3分）`
      : `Yukikaki: how is the solution working for ${i.businessName}? (3 min)`;
  const ja = `<p>${b} 様</p>
<p>学生チーム「${t}」（リーダー：${l}）が納品したツールについて、3分ほどのアンケートにご協力ください。音声で答えることもできます。</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none">アンケートに回答する</a></p>
<p style="color:#64748b;font-size:12px">このリンクは1回限り・14日間有効です。</p>`;
  const en = `<p>Hello ${b},</p>
<p>Please take 3 minutes to tell us how the solution delivered by team “${t}” (lead: ${l}) is working. You can also answer by voice.</p>
<p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none">Answer the impact check</a></p>
<p style="color:#64748b;font-size:12px">This link works once and expires in 14 days.</p>`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto">${i.locale === "ja" ? ja + "<hr/>" + en : en + "<hr/>" + ja}</div>`;
  const text =
    i.locale === "ja"
      ? `${i.businessName} 様\n学生チーム「${i.teamName}」のツールについてアンケートにご協力ください：${i.link}\n（1回限り・14日間有効）`
      : `Hello ${i.businessName},\nPlease tell us how team "${i.teamName}"'s solution is working: ${i.link}\n(single use, expires in 14 days)`;
  return { subject, html, text };
}
