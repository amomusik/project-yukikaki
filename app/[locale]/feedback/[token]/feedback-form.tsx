"use client";

import { useActionState, useState } from "react";
import { VoiceSession } from "@/components/voice-session";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import { submitFeedbackAction, type FeedbackResult } from "./actions";

type Props = {
  token: string;
  deliveryId: string;
  voiceAvailable: boolean;
  labels: Record<string, string>;
  voiceLabels: { start: string; stop: string; connecting: string; listening: string; speaking: string; micNote: string };
};

function YesNo({ name, labels }: { name: string; labels: Record<string, string> }) {
  return (
    <div className="flex gap-4 text-sm">
      <label className="flex items-center gap-1"><input type="radio" name={name} value="true" required defaultChecked /> {labels.yes}</label>
      <label className="flex items-center gap-1"><input type="radio" name={name} value="false" /> {labels.no}</label>
    </div>
  );
}

export function FeedbackForm({ token, deliveryId, voiceAvailable, labels, voiceLabels }: Props) {
  const [state, action, pending] = useActionState<FeedbackResult | null, FormData>(submitFeedbackAction, null);
  const [conversationId, setConversationId] = useState("");

  if (state?.ok) {
    return <Card className="text-center text-lg" data-testid="feedback-thanks">🙏 {labels.thanks}</Card>;
  }

  return (
    <div className="space-y-6">
      {voiceAvailable && (
        <Card className="py-8">
          {conversationId ? (
            <p className="text-center text-sm text-emerald-700">✓ {labels.voiceDone}</p>
          ) : (
            <VoiceSession agent="impact" token={token} dynamicVariables={{ delivery_id: deliveryId }} labels={voiceLabels} onEnded={setConversationId} />
          )}
        </Card>
      )}
      <Card>
        <form action={action} className="space-y-5">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="impactConversationId" value={conversationId} />
          <div>
            <Label htmlFor="hours">{labels.hours}</Label>
            <Input id="hours" name="hoursSavedPerWeek" type="number" min={0} max={80} step={0.5} inputMode="decimal" required className="max-w-32" />
          </div>
          <div>
            <Label>{labels.satisfaction}</Label>
            <div className="flex gap-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm">
                  <input type="radio" name="satisfaction" value={n} required defaultChecked={n === 4} /> {n}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>{labels.stillInUse}</Label>
            <YesNo name="stillInUse" labels={labels} />
          </div>
          <div>
            <Label>{labels.wouldRecommend}</Label>
            <YesNo name="wouldRecommend" labels={labels} />
          </div>
          <div>
            <Label htmlFor="issues">{labels.issues}</Label>
            <Textarea id="issues" name="issues" />
          </div>
          {state && !state.ok && <p className="text-sm text-rose-600">{labels[state.reason] ?? state.reason}</p>}
          <Button type="submit" disabled={pending}>{labels.submit}</Button>
        </form>
      </Card>
    </div>
  );
}
