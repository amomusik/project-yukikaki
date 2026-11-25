import { NextResponse } from "next/server";
import { z } from "zod";
import { SEARCH_MAX_LENGTH, searchChallenges } from "@/lib/queries";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const Query = z.object({
  q: z.string().trim().max(SEARCH_MAX_LENGTH * 2).default("").transform((s) => s.slice(0, SEARCH_MAX_LENGTH)),
  locale: z.enum(["en", "ja"]).default("ja"),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

/**
 * Public challenge search (challenges are public; only PUBLIC_STATUSES are returned).
 * GET /api/challenges/search?q=&locale=en|ja&limit=6 → { results: ChallengeSearchResult[] }
 * Empty q returns the most recent public challenges.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const parsed = Query.safeParse({
    q: params.get("q") ?? undefined,
    locale: params.get("locale") || undefined,
    limit: params.get("limit") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400, headers: NO_STORE },
    );
  }
  const { q, locale, limit } = parsed.data;
  try {
    const results = await searchChallenges(q, { locale, limit });
    return NextResponse.json({ results }, { headers: NO_STORE });
  } catch (err) {
    console.error("[api/challenges/search]", err);
    return NextResponse.json({ error: "search_failed" }, { status: 500, headers: NO_STORE });
  }
}
