import "server-only";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { authEnabled, hostEmails } from "@/lib/env";
import { syncBuilder } from "@/lib/graph/sync";

export type Role = "business" | "student" | "host";

/**
 * Lazily mirror the signed-in Clerk user into our users table (no webhook needed).
 * Emails listed in HOST_EMAILS are promoted to host on first sight; a host whose email is
 * removed from HOST_EMAILS is demoted (to their pre-host role, else "business") on next request.
 */
export async function ensureUser(): Promise<User | null> {
  // No Clerk keys → no sessions. Calling auth() here would throw (clerkMiddleware isn't running).
  if (!authEnabled()) return null;
  const { userId } = await auth();
  if (!userId) return null;
  const db = getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.clerkId, userId));
  // Fast path: known user with a role → no Clerk API round trip on every request.
  if (existing?.role) {
    const shouldBeHost = !!existing.email && hostEmails().includes(existing.email.toLowerCase());
    if (shouldBeHost && existing.role !== "host") {
      const [u] = await db.update(schema.users).set({ role: "host", updatedAt: new Date() }).where(eq(schema.users.id, existing.id)).returning();
      await setClerkRole(userId, "host", existing.role ?? undefined);
      return u;
    }
    if (!shouldBeHost && existing.role === "host") return demoteHost(existing);
    return existing;
  }
  const cu = await currentUser();
  if (!cu) return existing ?? null;
  const email = (cu.primaryEmailAddress?.emailAddress ?? cu.emailAddresses[0]?.emailAddress ?? "").toLowerCase();
  const isHost = !!email && hostEmails().includes(email);
  const metaRole = (cu.publicMetadata?.role as Role | undefined) ?? null;
  // Clerk metadata may still say "host" for a revoked host (e.g. DB row recreated): never trust it.
  const role: Role | null = isHost ? "host" : (existing?.role ?? (metaRole === "host" ? preHostRole(cu.publicMetadata) : metaRole));
  const displayName = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || email.split("@")[0] || "User";

  if (existing) {
    if (existing.role !== role || existing.email !== email) {
      const [u] = await db
        .update(schema.users)
        .set({ role, email, updatedAt: new Date() })
        .where(eq(schema.users.id, existing.id))
        .returning();
      if (isHost && metaRole !== "host") await setClerkRole(userId, "host", existing.role ?? undefined);
      else if (!isHost && metaRole === "host" && role) await setClerkRole(userId, role, null);
      return u;
    }
    return existing;
  }
  const [u] = await db
    .insert(schema.users)
    .values({ clerkId: userId, email, displayName, role })
    .onConflictDoNothing({ target: schema.users.clerkId })
    .returning();
  if (isHost && metaRole !== "host") await setClerkRole(userId, "host", metaRole ?? undefined);
  else if (!isHost && metaRole === "host" && role) await setClerkRole(userId, role, null);
  return u ?? (await db.select().from(schema.users).where(eq(schema.users.clerkId, userId)))[0];
}

/** Role to restore when host access is revoked: the role recorded at promotion, else "business". */
function preHostRole(meta: Record<string, unknown> | null | undefined): "business" | "student" {
  const prev = meta?.preHostRole;
  return prev === "student" || prev === "business" ? prev : "business";
}

/** Email no longer in HOST_EMAILS: demote in the DB and sync Clerk publicMetadata. */
async function demoteHost(existing: User): Promise<User> {
  let meta: Record<string, unknown> | undefined;
  try {
    meta = (await currentUser())?.publicMetadata as Record<string, unknown> | undefined;
  } catch {
    meta = undefined;
  }
  const role = preHostRole(meta);
  const [u] = await getDb().update(schema.users).set({ role, updatedAt: new Date() }).where(eq(schema.users.id, existing.id)).returning();
  await setClerkRole(existing.clerkId, role, null);
  console.info(`[auth] host access revoked for user ${existing.id} (now ${role})`);
  return u;
}

/** `preHost`: remember the role held before host promotion (business/student = store, null = clear, else leave as is). */
async function setClerkRole(clerkUserId: string, role: Role, preHost?: Role | null) {
  try {
    const client = await clerkClient();
    const publicMetadata: Record<string, unknown> = { role };
    if (preHost === null || preHost === "business" || preHost === "student") publicMetadata.preHostRole = preHost;
    await client.users.updateUserMetadata(clerkUserId, { publicMetadata });
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

/** Where protected pages send visitors when sign-in isn't configured (no Clerk keys). */
export const authSetupPath = (locale: string) => `/${locale}/auth-setup`;

export async function requireUser(locale: string): Promise<User> {
  if (!authEnabled()) redirect(authSetupPath(locale));
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
