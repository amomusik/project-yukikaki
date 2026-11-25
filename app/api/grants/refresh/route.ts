import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureUser } from "@/lib/auth";
import { refreshGrantMatches } from "@/lib/grants/store";

export const dynamic = "force-dynamic";
// Several rate-limited jGrants calls (+ optional Linkup) run inline.
export const maxDuration = 120;

const NO_STORE = { "Cache-Control": "no-store" };
const Body = z.object({ briefId: z.string().uuid() });

/** Host-only: re-run grant matching for one brief. POST { briefId } → RefreshResult. */
export async function POST(req: Request) {
  const user = await ensureUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (user.role !== "host") return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400, headers: NO_STORE });
  try {
    const result = await refreshGrantMatches(parsed.data.briefId);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "Brief not found" ? 404 : 502;
    return NextResponse.json({ error: status === 404 ? "not_found" : "refresh_failed", message }, { status, headers: NO_STORE });
  }
}
