import { clerkMiddleware } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intl = createIntlMiddleware(routing);

/**
 * Clerk session + locale routing. Auth is enforced where data is accessed
 * (requireUser / requireRole in pages and server actions, auth() in API routes),
 * as Clerk recommends — not by path matching here.
 */
export default clerkMiddleware(async (_auth, req) => {
  if (req.nextUrl.pathname.startsWith("/api")) return;
  return intl(req);
});

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)", "/(api|trpc)(.*)"],
};
