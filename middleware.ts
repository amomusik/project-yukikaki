import { clerkMiddleware } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { authEnabled } from "./lib/auth-config";

const intl = createIntlMiddleware(routing);

// Clerk's hosted widgets can't render without keys; send these straight to the setup explainer.
const CLERK_PAGES = /^\/(en|ja)\/(sign-in|sign-up)(\/|$)/;

function localeRouting(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api")) return;
  return intl(req);
}

function noAuthRouting(req: NextRequest) {
  const m = req.nextUrl.pathname.match(CLERK_PAGES);
  if (m) return NextResponse.redirect(new URL(`/${m[1]}/auth-setup`, req.url), 307);
  return localeRouting(req);
}

/**
 * Clerk session + locale routing. Auth is enforced where data is accessed
 * (requireUser / requireRole in pages and server actions, auth() in API routes),
 * as Clerk recommends — not by path matching here.
 * Without Clerk keys (fresh clone, zero config) only next-intl runs and sign-in is off.
 */
export default authEnabled() ? clerkMiddleware(async (_auth, req) => localeRouting(req)) : noAuthRouting;

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)", "/(api|trpc)(.*)"],
};
