import { after, NextResponse } from "next/server";
import { ingestInterview } from "@/lib/briefs";
import { env } from "@/lib/env";
import { ingestImpact } from "@/lib/feedback";
import { agentKind, parseConversation, verifySignature, webhookSchema } from "@/lib/integrations/elevenlabs";
import { recordServiceEvent } from "@/lib/integrations/_guard";
import { processBrief } from "@/lib/pipeline/brief";

// The brief pipeline runs in after() (Linkup + Adaption + Dify); 300 s = Vercel Hobby max.
export const maxDuration = 300;

/** Production ingestion path: ElevenLabs post-call webhook (HMAC-signed). */
export async function POST(req: Request) {
  if (!env.ELEVENLABS_WEBHOOK_SECRET) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("elevenlabs-signature"), env.ELEVENLABS_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const body = webhookSchema.safeParse(JSON.parse(raw));
  if (!body.success) return NextResponse.json({ error: "bad payload" }, { status: 400 });
  if (body.data.type !== "post_call_transcription") return NextResponse.json({ ignored: body.data.type });

  const conv = parseConversation(body.data.data);
  const kind = agentKind(conv.agentId);
  await recordServiceEvent({ service: "elevenlabs", operation: `webhook:${kind}`, ok: true, latencyMs: 0 });

  if (kind === "interview") {
    const { briefId, created } = await ingestInterview(conv);
    if (created) after(() => processBrief(briefId).catch((e) => console.error("[pipeline]", e)));
    return NextResponse.json({ briefId, created });
  }
  if (kind === "impact") return NextResponse.json(await ingestImpact(conv));
  return NextResponse.json({ ignored: "unknown agent" });
}
