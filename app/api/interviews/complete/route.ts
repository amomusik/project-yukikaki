import { auth } from "@clerk/nextjs/server";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { authEnabled } from "@/lib/env";
import { ingestInterview } from "@/lib/briefs";
import { agentKind, waitForConversation } from "@/lib/integrations/elevenlabs";
import { withFallback } from "@/lib/integrations/_guard";
import { processBrief } from "@/lib/pipeline/brief";

export const maxDuration = 300;

/**
 * Local-friendly ingestion path: the browser reports the conversation id when the call
 * ends; we poll ElevenLabs until analysis is done. No public webhook URL needed.
 * Idempotent with the webhook path (unique conversation id).
 */
export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ error: "unauthorized: sign-in is not configured (set the Clerk keys)" }, { status: 401 });
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
    const { briefId, created } = await ingestInterview(r.value);
    if (created) await processBrief(briefId).catch((e) => console.error("[pipeline]", e));
  });
  return NextResponse.json({ status: "processing" }, { status: 202 });
}
