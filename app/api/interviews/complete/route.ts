import { after, NextResponse } from "next/server";
import { z } from "zod";
import { ensureUser } from "@/lib/auth";
import { authEnabled } from "@/lib/env";
import { ingestInterview, InterviewOwnershipError } from "@/lib/briefs";
import { agentKind, waitForConversation } from "@/lib/integrations/elevenlabs";
import { withFallback } from "@/lib/integrations/_guard";
import { processBrief } from "@/lib/pipeline/brief";

export const maxDuration = 300;

/**
 * Local-friendly ingestion path: the browser reports the conversation id when the call
 * ends; we poll ElevenLabs until analysis is done. No public webhook URL needed.
 * Idempotent with the webhook path (unique conversation id).
 * Ownership: the conversation's server-signed yk_nonce must be bound to the caller's users.id.
 */
export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "unauthorized: sign-in is not configured (set the Clerk keys)" }, { status: 401 });
  const user = await ensureUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z.object({ conversationId: z.string().min(5).max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const { conversationId } = parsed.data;

  after(async () => {
    const r = await withFallback(
      "elevenlabs",
      "waitForConversation",
      (signal) => waitForConversation(conversationId, { maxWaitMs: 240_000, signal }),
      null,
      { timeoutMs: 250_000 },
    );
    if (!r.value || agentKind(r.value.agentId) !== "interview") return;
    let ingested: Awaited<ReturnType<typeof ingestInterview>>;
    try {
      ingested = await ingestInterview(r.value, { expectedUserId: user.id });
    } catch (e) {
      if (e instanceof InterviewOwnershipError) {
        console.warn(`[interviews/complete] rejected conversation ${conversationId}: ${e.message}`);
        return;
      }
      throw e;
    }
    const { briefId, created } = ingested;
    if (created) await processBrief(briefId).catch((e) => console.error("[pipeline]", e));
  });
  return NextResponse.json({ status: "processing" }, { status: 202 });
}
