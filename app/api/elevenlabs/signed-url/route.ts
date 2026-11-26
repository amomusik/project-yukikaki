import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { authEnabled, env } from "@/lib/env";
import { checkFeedbackToken } from "@/lib/feedback";
import { getSignedUrl } from "@/lib/integrations/elevenlabs";
import { withFallback } from "@/lib/integrations/_guard";

/**
 * Hands the browser a signed URL for a private agent (API key stays on the server),
 * or the public agent id if signing fails. Interview: signed-in users. Impact: valid feedback token.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const agent = url.searchParams.get("agent");
  let agentId: string | undefined;
  if (agent === "interview") {
    if (!authEnabled()) return new NextResponse("unauthorized: sign-in is not configured (set the Clerk keys)", { status: 401 });
    const { userId } = await auth();
    if (!userId) return new NextResponse("unauthorized", { status: 401 });
    agentId = env.ELEVENLABS_INTERVIEW_AGENT_ID;
  } else if (agent === "impact") {
    const check = await checkFeedbackToken(url.searchParams.get("token") ?? "");
    if (!check.ok) return new NextResponse("invalid token", { status: 403 });
    agentId = env.ELEVENLABS_IMPACT_AGENT_ID;
  } else {
    return new NextResponse("unknown agent", { status: 400 });
  }
  if (!agentId) return new NextResponse("agent not configured", { status: 503 });
  const r = await withFallback("elevenlabs", "signedUrl", () => getSignedUrl(agentId!), null, { timeoutMs: 8_000 });
  return NextResponse.json(r.value ? { signedUrl: r.value } : { agentId });
}
