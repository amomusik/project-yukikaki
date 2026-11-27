"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useRef, useState } from "react";
import { Button } from "./ui";

type Labels = { start: string; stop: string; connecting: string; listening: string; speaking: string; micNote: string };

type Props = {
  agent: "interview" | "impact";
  /** Needed for the impact agent: proves the caller holds a valid feedback link. */
  token?: string;
  dynamicVariables: Record<string, string>;
  labels: Labels;
  onEnded: (conversationId: string) => void;
};

/** ElevenLabs voice session. Fetches a signed URL (or public agent id) from our server. */
export function VoiceSession(props: Props) {
  return (
    <ConversationProvider>
      <Inner {...props} />
    </ConversationProvider>
  );
}

function Inner({ agent, token, dynamicVariables, labels, onEnded }: Props) {
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);
  const endedRef = useRef(false);
  const finish = () => {
    if (idRef.current && !endedRef.current) {
      endedRef.current = true;
      onEnded(idRef.current);
    }
  };
  const conversation = useConversation({
    onConnect: ({ conversationId: id }) => {
      idRef.current = id;
      endedRef.current = false;
    },
    onDisconnect: finish,
    onError: (message: unknown) => setError(typeof message === "string" ? message : "Voice session error"),
  });
  const status = conversation.status;
  const active = status === "connected" || status === "connecting";

  async function start() {
    setError(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const qs = new URLSearchParams({ agent, ...(token ? { token } : {}) });
      const res = await fetch(`/api/elevenlabs/signed-url?${qs}`);
      if (!res.ok) throw new Error(await res.text());
      const { signedUrl, agentId, dynamicVariables: serverVars } = (await res.json()) as {
        signedUrl?: string;
        agentId?: string;
        /** Server-signed ownership nonce ({ yk_nonce }); the only identity the server trusts. */
        dynamicVariables?: Record<string, string>;
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session: any = signedUrl ? { signedUrl } : { agentId, connectionType: "webrtc" };
      // Server variables go last so page-supplied values can never shadow yk_nonce.
      conversation.startSession({ ...session, dynamicVariables: { ...dynamicVariables, ...serverVars } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function stop() {
    conversation.endSession();
    finish();
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div
        aria-hidden
        className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl transition ${
          status === "connected"
            ? conversation.isSpeaking
              ? "scale-110 bg-sky-200 dark:bg-sky-800"
              : "animate-pulse bg-emerald-100 dark:bg-emerald-900"
            : "bg-slate-100 dark:bg-slate-800"
        }`}
      >
        🎙️
      </div>
      <p className="min-h-6 text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
        {status === "connecting" ? labels.connecting : status === "connected" ? (conversation.isSpeaking ? labels.speaking : labels.listening) : labels.micNote}
      </p>
      {active ? (
        <Button variant="danger" onClick={stop}>
          {labels.stop}
        </Button>
      ) : (
        <Button onClick={start} className="px-6 py-3 text-base">
          {labels.start}
        </Button>
      )}
      {/* Always-mounted live region so screen readers announce microphone/connection failures. */}
      <div aria-live="assertive" aria-atomic="true">
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
