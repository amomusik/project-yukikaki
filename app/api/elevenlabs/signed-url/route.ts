import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { authEnabled, env } from "@/lib/env";
import { checkFeedbackToken } from "@/lib/feedback";
import { NONCE_VAR, signInterviewNonce } from "@/lib/interview-nonce";
import { getSignedUrl } from "@/lib/integrations/elevenlabs";
import { withFallback } from "@/lib/integrations/_guard";

/**
 * Hands the browser a signed URL for a private agent (API key stays on the server),
 * or the public agent id if signing fails. Interview: signed-in business owners/hosts. Impact: valid feedback token.
 * Also returns a short-lived server-signed nonce (`yk_nonce`) binding the verified identity; the client
 * passes only this as a dynamic variable and ingestion takes ownership from it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const agent = url.searchParams.get("agent");
  let agentId: string | undefined;
  let nonce: string;
  if (agent === "interview") {
    if (!authEnabled()) return new NextResponse("unauthorized: sign-in is not configured (set the Clerk keys)", { status: 401 });
    const user = await ensureUser();
    if (!user) return new NextResponse("unauthorized", { status: 401 });
    if (user.role !== "business" && user.role !== "host") return new NextResponse("forbidden", { status: 403 });
    const [business] = await getDb()
      .select({ id: schema.businesses.id })
      .from(schema.businesses)
      .where(eq(schema.businesses.ownerUserId, user.id))
      .orderBy(desc(schema.businesses.createdAt))
      .limit(1);
    nonce = signInterviewNonce({ kind: "interview", userId: user.id, businessId: business?.id ?? null });
    agentId = env.ELEVENLABS_INTERVIEW_AGENT_ID;
  } else if (agent === "impact") {
    const check = await checkFeedbackToken(url.searchParams.get("token") ?? "");
    if (!check.ok) return new NextResponse("invalid token", { status: 403 });
    nonce = signInterviewNonce({ kind: "impact", userId: null, deliveryId: check.deliveryId });
    agentId = env.ELEVENLABS_IMPACT_AGENT_ID;
  } else {
    return new NextResponse("unknown agent", { status: 400 });
  }
  if (!agentId) return new NextResponse("agent not configured", { status: 503 });
  const r = await withFallback("elevenlabs", "signedUrl", () => getSignedUrl(agentId!), null, { timeoutMs: 8_000 });
  return NextResponse.json({ ...(r.value ? { signedUrl: r.value } : { agentId }), dynamicVariables: { [NONCE_VAR]: nonce } });
}
