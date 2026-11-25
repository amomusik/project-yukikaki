import { randomUUID } from "node:crypto";
import { getDb, schema } from "@/lib/db";
import type { BriefStatus } from "@/lib/db/schema";

export async function makeUser(role: "business" | "student" | "host", over: Partial<typeof schema.users.$inferInsert> = {}) {
  const id = randomUUID().slice(0, 8);
  const [u] = await getDb()
    .insert(schema.users)
    .values({
      clerkId: `clerk_${id}`,
      displayName: `${role}-${id}`,
      email: `${role}-${id}@example.com`,
      role,
      ...over,
    })
    .returning();
  return u;
}

export async function makeBrief(status: BriefStatus = "draft", over: { city?: string; industry?: string; ownerId?: string; slug?: string } = {}) {
  const db = getDb();
  const owner = over.ownerId ?? (await makeUser("business")).id;
  const [biz] = await db
    .insert(schema.businesses)
    .values({ ownerUserId: owner, name: "Menya Test", city: over.city ?? "Sapporo", industry: over.industry ?? "ramen" })
    .returning();
  const lang = { title: "Reservation chaos", problem: "Phone reservations and LINE messages pile up", current_process: "Paper notebook", desired_outcome: "Auto replies" };
  const [brief] = await db
    .insert(schema.briefs)
    .values({
      businessId: biz.id,
      slug: over.slug ?? null,
      content: { ja: lang, en: lang },
      transcript: "Owner: we lose 6 hours a week on reservations",
      skillsNeeded: ["booking-automation", "line-bot"],
      status,
    })
    .returning();
  return { brief, business: biz, ownerId: owner };
}
