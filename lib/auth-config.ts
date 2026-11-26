// Dependency-free so the edge middleware can import it without pulling in the full env schema.

export type ClerkKeys = { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string; CLERK_SECRET_KEY?: string };

/**
 * Sign-in is available only when both Clerk keys are set. Without them the app runs with no
 * auth: public pages render, protected pages show /auth-setup, auth-only APIs return 401.
 * Literal process.env reads so the edge middleware bundle sees the values too.
 */
export function authEnabled(
  source: ClerkKeys = {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  },
): boolean {
  return Boolean(source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && source.CLERK_SECRET_KEY?.trim());
}
