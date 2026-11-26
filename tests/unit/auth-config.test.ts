import { afterEach, describe, expect, it, vi } from "vitest";
import { authEnabled } from "@/lib/auth-config";

describe("authEnabled()", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("needs both Clerk keys", () => {
    expect(authEnabled({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x", CLERK_SECRET_KEY: "sk_test_x" })).toBe(true);
    expect(authEnabled({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" })).toBe(false);
    expect(authEnabled({ CLERK_SECRET_KEY: "sk_test_x" })).toBe(false);
    expect(authEnabled({})).toBe(false);
  });

  it("treats empty and whitespace values (cp .env.example .env.local) as missing", () => {
    expect(authEnabled({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "", CLERK_SECRET_KEY: "" })).toBe(false);
    expect(authEnabled({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "  ", CLERK_SECRET_KEY: "sk_test_x" })).toBe(false);
  });

  it("reads process.env by default", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(authEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
    expect(authEnabled()).toBe(true);
  });
});
