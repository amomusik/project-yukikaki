import "server-only";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { hostEmails } from "@/lib/env";
import { syncBuilder } from "@/lib/graph/sync";

export type Role = "business" | "student" | "host";

/**
 * Lazily mirror the signed-in Clerk user into our users table (no webhook needed).
 * Emails listed in HOST_EMAILS are promoted to host on first sight.
 */
export async function ensureUser(): Promise<User | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const db = getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.clerkId, userId));
  // Fast path: known user with a role → no Clerk API round trip on every request.
  if (existing?.role) {
    const shouldBeHost = !!existing.email && hostEmails().includes(existing.email.toLowerCase());
    if (shouldBeHost && existing.role !== "host") {
      const [u] = await db.update(schema.users).set({ role: "host", updatedAt: new Date() }).where(eq(schema.users.id, existing.id)).returning();
      await setClerkRole(userId, "host");
      return u;
    }
    return existing;
  }
  const cu = await currentUser();
  if (!cu) return existing ?? null;
  const email = (cu.primaryEmailAddress?.emailAddress ?? cu.emailAddresses[0]?.emailAddress ?? "").toLowerCase();
  const isHost = !!email && hostEmails().includes(email);
  const metaRole = (cu.publicMetadata?.role as Role | undefined) ?? null;
  const role: Role | null = isHost ? "host" : (existing?.role ?? metaRole);
  const displayName = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || email.split("@")[0] || "User";

  if (existing) {
    if (existing.role !== role || existing.email !== email) {
      const [u] = await db
        .update(schema.users)
        .set({ role, email, updatedAt: new Date() })
        .where(eq(schema.users.id, existing.id))
        .returning();
      if (isHost && metaRole !== "host") await setClerkRole(userId, "host");
      return u;
    }
    return existing;
  }
  const [u] = await db
    .insert(schema.users)
    .values({ clerkId: userId, email, displayName, role })
    .onConflictDoNothing({ target: schema.users.clerkId })
    .returning();
  if (isHost && metaRole !== "host") await setClerkRole(userId, "host");
  return u ?? (await db.select().from(schema.users).where(eq(schema.users.clerkId, userId)))[0];
}

async function setClerkRole(clerkUserId: string, role: Role) {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, { publicMetadata: { role } });
  } catch (e) {
    console.warn("[auth] could not update Clerk metadata", e);
  }
}

/** Onboarding: users pick business or student. Host is never self-selectable. */
export async function chooseRole(role: "business" | "student", skills: string[] = []) {
  const user = await ensureUser();
  if (!user) throw new Error("Not signed in");
  if (user.role === "host") return user;
  const [u] = await getDb()
    .update(schema.users)
    .set({ role, skills: role === "student" ? skills : [], updatedAt: new Date() })
    .where(eq(schema.users.id, user.id))
    .returning();
  await setClerkRole(user.clerkId, role);
  if (role === "student") await syncBuilder(u);
  return u;
}

export async function requireUser(locale: string): Promise<User> {
  const user = await ensureUser();
  if (!user) redirect(`/${locale}/sign-in`);
  if (!user.role) redirect(`/${locale}/onboarding`);
  return user;
}

export async function requireRole(locale: string, ...roles: Role[]): Promise<User> {
  const user = await requireUser(locale);
  if (!user.role || !roles.includes(user.role)) redirect(`/${locale}`);
  return user;
}
