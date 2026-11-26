import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/auth.ts with no Clerk keys: it must never call Clerk (auth() throws without clerkMiddleware)
// and protected pages must land on the setup explainer instead of a 500.
const clerk = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), clerkClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => clerk);
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

import { authSetupPath, chooseRole, ensureUser, requireRole, requireUser } from "@/lib/auth";

describe("lib/auth without Clerk keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
  });

  it("ensureUser() returns null without touching Clerk", async () => {
    await expect(ensureUser()).resolves.toBeNull();
    expect(clerk.auth).not.toHaveBeenCalled();
    expect(clerk.currentUser).not.toHaveBeenCalled();
  });

  it("requireUser/requireRole redirect to the auth setup page", async () => {
    expect(authSetupPath("ja")).toBe("/ja/auth-setup");
    await expect(requireUser("en")).rejects.toThrow("NEXT_REDIRECT /en/auth-setup");
    await expect(requireRole("ja", "host")).rejects.toThrow("NEXT_REDIRECT /ja/auth-setup");
    expect(clerk.auth).not.toHaveBeenCalled();
  });

  it("chooseRole() refuses with a clear error", async () => {
    await expect(chooseRole("student")).rejects.toThrow("Not signed in");
  });
});
