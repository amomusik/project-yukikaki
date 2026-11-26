import "./load-env";
import { and, eq, inArray, like } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { RsvpRole } from "@/lib/db/schema";
import { jstLocalToDate } from "@/lib/events/format";
import { createEvent, rsvp, type EventInput } from "@/lib/events/store";

/**
 * `pnpm seed:events` — three demo events (is_demo = true) linked to seeded challenges.
 * Idempotent: previous demo events (and their RSVPs) are replaced; real events are never touched.
 * Venues are the candidate Venue entities from seed/seed.json (also in the Neo4j graph).
 * Run `pnpm seed` first so the challenge briefs and synthetic students exist.
 */
const HOST_CLERK_ID = "seed_events_host";

type DemoEvent = {
  slug: string;
  briefSlugs: string[];
  input: Omit<EventInput, "briefIds" | "startsAt" | "endsAt">;
  starts: string; // JST wall clock
  ends: string;
  rsvps: { student: string; role: RsvpRole }[];
};

const DEMO: DemoEvent[] = [
  {
    slug: "sapporo-snow-tech-hackathon-2027",
    briefSlugs: ["sapporo-snow-dispatch", "sapporo-ramen-reservations"],
    starts: "2027-01-30T10:00",
    ends: "2027-01-31T17:00",
    input: {
      title: { en: "Sapporo Snow-Tech Hackathon", ja: "さっぽろ雪テック・ハッカソン" },
      summary: {
        en: "A two-day winter hackathon on two real Sapporo problems: getting snow-removal requests from phone calls and paper into a dispatch board, and answering ramen-shop reservations on LINE without the owner stopping the noodles. Owners join the kickoff and the final demos. Bring a laptop; teams of 3–5 form on day one. Mentors welcome.",
        ja: "札幌のリアルな課題2つに取り組む、冬の2日間ハッカソン。電話と紙で受けている除雪依頼を配車ボードにつなぐ仕組みと、店主が麺の手を止めずにLINEの予約に答えられる仕組みをつくります。事業者の方もキックオフと最終発表に参加します。ノートPC持参、チーム（3〜5人）は初日に結成。メンター参加も歓迎です。",
      },
      format: "hackathon",
      city: "Sapporo",
      venueName: "札幌市中央図書館 Sapporo Central Library",
      venueAddress: "北海道札幌市中央区南22条西13丁目1-1",
      onlineUrl: null,
      coverImage: null,
      capacity: 40,
    },
    rsvps: [
      { student: "s-haruto", role: "participant" },
      { student: "s-aoi", role: "participant" },
      { student: "s-ren", role: "participant" },
      { student: "s-mio", role: "participant" },
      { student: "s-maya", role: "mentor" },
      { student: "s-daniel", role: "participant" },
      { student: "s-sofia", role: "participant" },
      { student: "s-takumi", role: "observer" },
    ],
  },
  {
    slug: "otaru-guesthouse-design-charrette",
    briefSlugs: ["otaru-ryokan-subsidy"],
    starts: "2026-12-12T10:00",
    ends: "2026-12-12T17:00",
    input: {
      title: { en: "Otaru Guesthouse Design Charrette", ja: "小樽ゲストハウス・デザインシャレット" },
      summary: {
        en: "A one-day, hands-on design session with a canal-side inn, residents and students. We map how lodging-tax records and subsidy paperwork flow today, sketch a simpler process together, and leave with a prioritised list of small tools to build. No coding needed — designers, residents and anyone who has filled in a government form are welcome.",
        ja: "運河沿いの宿、住民、学生が一緒に手を動かす1日のデザインセッション。宿泊税の記録や補助金書類が今どう流れているかを書き出し、もっと簡単な流れを一緒に描き、作るべき小さなツールの優先リストを持ち帰ります。プログラミング不要。デザイナー、住民、役所の書類を書いたことがある方なら誰でも歓迎です。",
      },
      format: "charrette",
      city: "Otaru",
      venueName: "小樽市立図書館 Otaru City Library",
      venueAddress: "北海道小樽市花園5丁目1-1",
      onlineUrl: null,
      coverImage: null,
      capacity: 20,
    },
    rsvps: [
      { student: "s-yui", role: "participant" },
      { student: "s-kenta", role: "participant" },
      { student: "s-hana", role: "participant" },
      { student: "s-emma", role: "mentor" },
    ],
  },
  {
    slug: "setagaya-small-shop-test-kitchen",
    briefSlugs: ["setagaya-bakery-ordering"],
    starts: "2027-02-20T13:00",
    ends: "2027-02-20T19:00",
    input: {
      title: { en: "Setagaya Small-Shop Test Kitchen", ja: "世田谷スモールショップ・テストキッチン" },
      summary: {
        en: "An afternoon test kitchen with a neighbourhood bakery: try the production-forecast and ingredient-ordering prototypes against last month's real orders, watch the owner use them, and fix what breaks on the spot. Small group on purpose — when it's full, join the waitlist and you'll be moved in automatically if a seat opens.",
        ja: "まちのパン屋さんと過ごす午後のテストキッチン。製造量予測と材料発注のプロトタイプを先月の実際の注文データで試し、店主が使う様子を見ながら、その場で直します。少人数制です。満席の場合はキャンセル待ちに登録すると、席が空いたとき自動で繰り上がります。",
      },
      format: "test_kitchen",
      city: "Setagaya",
      venueName: "世田谷区立中央図書館 Setagaya Central Library",
      venueAddress: "東京都世田谷区弦巻3-16-8",
      onlineUrl: null,
      coverImage: null,
      capacity: 8,
    },
    rsvps: [
      { student: "s-hana", role: "participant" },
      { student: "s-takumi", role: "participant" },
      { student: "s-riko", role: "participant" },
      { student: "s-sota", role: "participant" },
      { student: "s-yuto", role: "participant" },
      { student: "s-emma", role: "participant" },
      { student: "s-maya", role: "mentor" },
      { student: "s-kenta", role: "participant" },
      // Over capacity → waitlisted.
      { student: "s-aoi", role: "participant" },
      { student: "s-daniel", role: "participant" },
    ],
  },
];

async function main() {
  const db = getDb();

  // Synthetic host account that owns the demo events (wiped by `pnpm seed` with other synthetic users).
  let [host] = await db.select().from(schema.users).where(eq(schema.users.clerkId, HOST_CLERK_ID));
  if (!host) {
    [host] = await db
      .insert(schema.users)
      .values({ clerkId: HOST_CLERK_ID, role: "host", displayName: "Yukikaki Events Team", email: "events-demo@example.com", locale: "en", isSynthetic: true })
      .returning();
  }

  const removed = await db.delete(schema.events).where(eq(schema.events.isDemo, true)).returning({ id: schema.events.id });
  if (removed.length) console.log(`- removed ${removed.length} previous demo events`);

  const students = await db
    .select({ id: schema.users.id, clerkId: schema.users.clerkId })
    .from(schema.users)
    .where(and(eq(schema.users.isSynthetic, true), like(schema.users.clerkId, "seed_s-%")));
  const studentId = new Map(students.map((s) => [s.clerkId.replace(/^seed_/, ""), s.id]));

  for (const d of DEMO) {
    const briefs = await db.select({ id: schema.briefs.id, slug: schema.briefs.slug }).from(schema.briefs).where(inArray(schema.briefs.slug, d.briefSlugs));
    const missing = d.briefSlugs.filter((s) => !briefs.some((b) => b.slug === s));
    if (missing.length) console.warn(`  ! ${d.slug}: briefs not found (run \`pnpm seed\`): ${missing.join(", ")}`);
    const ev = await createEvent(
      host,
      { ...d.input, startsAt: jstLocalToDate(d.starts)!, endsAt: jstLocalToDate(d.ends)!, briefIds: briefs.map((b) => b.id) },
      { publish: true, slug: d.slug, isDemo: true },
    );
    const counts = { going: 0, waitlist: 0 };
    for (const r of d.rsvps) {
      const uid = studentId.get(r.student);
      if (!uid) continue;
      // Stagger created_at so waitlist order is deterministic.
      const res = await rsvp(ev.id, uid, r.role, new Date(Date.now() - (d.rsvps.length - counts.going - counts.waitlist) * 60_000));
      counts[res.status === "going" ? "going" : "waitlist"]++;
    }
    console.log(`✓ ${ev.slug} (${d.input.format}, ${d.starts} JST) — ${briefs.length} challenges, ${counts.going} going, ${counts.waitlist} waitlisted`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
