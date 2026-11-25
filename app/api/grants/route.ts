import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { getGrantMatches, listOpenGrants, GRANTLINE_URL } from "@/lib/grants/store";
import { PUBLIC_STATUSES } from "@/lib/queries";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const NOTICE =
  "Yukikaki discovers and matches public programmes only. Since January 2026 preparing grant applications for a fee is reserved to licensed gyoseishoshi (行政書士); hosts file with a licensed professional.";

const serialize = <T extends { deadline: Date | null; fetchedAt: Date }>(g: T) => ({
  ...g,
  deadline: g.deadline?.toISOString() ?? null,
  fetchedAt: g.fetchedAt.toISOString(),
});

/**
 * Public: open grants matched to published challenges.
 *   GET /api/grants            → { grants: [...] } across all published challenges
 *   GET /api/grants?brief=uuid → { grants: [...] } for one published challenge
 */
export async function GET(req: Request) {
  const briefId = new URL(req.url).searchParams.get("brief");
  try {
    if (briefId !== null) {
      if (!isUuid(briefId)) return NextResponse.json({ error: "invalid_brief" }, { status: 400, headers: NO_STORE });
      const [b] = await getDb().select({ status: schema.briefs.status }).from(schema.briefs).where(eq(schema.briefs.id, briefId));
      if (!b || !PUBLIC_STATUSES.includes(b.status)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
      const grants = await getGrantMatches(briefId);
      return NextResponse.json({ grants: grants.map(serialize), notice: NOTICE, eligibility: GRANTLINE_URL }, { headers: NO_STORE });
    }
    const grants = await listOpenGrants();
    return NextResponse.json({ grants: grants.map(serialize), notice: NOTICE, eligibility: GRANTLINE_URL }, { headers: NO_STORE });
  } catch (err) {
    console.error("[api/grants]", err);
    return NextResponse.json({ error: "grants_failed" }, { status: 500, headers: NO_STORE });
  }
}
