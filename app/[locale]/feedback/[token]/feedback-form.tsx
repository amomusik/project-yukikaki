"use client";

import { useActionState, useState } from "react";
import { VoiceSession } from "@/components/voice-session";
import { Button, Card, Input, Label, Textarea } from "@/components/ui";
import { submitFeedbackAction, type FeedbackResult } from "./actions";

type Props = {
  token: string;
  locale: string;
  deliveryId: string;
  voiceAvailable: boolean;
  labels: Record<string, string>;
  voiceLabels: { start: string; stop: string; connecting: string; listening: string; speaking: string; micNote: string };
};

const legendClass = "mb-1.5 block text-sm font-medium";

/** A required yes/no question with no pre-selected answer. */
function YesNo({ name, legend, labels }: { name: string; legend: string; labels: Record<string, string> }) {
  return (
    <fieldset>
      <legend className={legendClass}>{legend}</legend>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="radio" name={name} value="true" required /> {labels.yes}</label>
        <label className="flex items-center gap-1"><input type="radio" name={name} value="false" /> {labels.no}</label>
      </div>
    </fieldset>
  );
}

export function FeedbackForm({ token, locale, deliveryId, voiceAvailable, labels, voiceLabels }: Props) {
  const [state, action, pending] = useActionState<FeedbackResult | null, FormData>(submitFeedbackAction, null);
  const [conversationId, setConversationId] = useState("");

  if (state?.ok) {
    return (
      <Card className="text-center" data-testid="feedback-thanks">
        <p className="text-lg">🙏 {labels.thanks}</p>
        {state.withdrawUrl && (
          <p className="mt-3 text-sm text-muted">
            {labels.withdrawHint}{" "}
            <a href={state.withdrawUrl} className="underline" data-testid="withdraw-link">{labels.withdrawLink}</a>
          </p>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {voiceAvailable && (
        <Card className="py-8">
          {conversationId ? (
            <p className="text-center text-sm text-emerald-700" role="status">✓ {labels.voiceDone}</p>
          ) : (
            <VoiceSession agent="impact" token={token} dynamicVariables={{ delivery_id: deliveryId }} labels={voiceLabels} onEnded={setConversationId} />
          )}
        </Card>
      )}
      <Card>
        <form action={action} className="space-y-5">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="impactConversationId" value={conversationId} />
          <div>
            <Label htmlFor="hours">{labels.hours}</Label>
            <Input id="hours" name="hoursSavedPerWeek" type="number" min={0} max={80} step={0.5} inputMode="decimal" required className="max-w-32" />
          </div>
          <fieldset aria-describedby="satisfaction-scale">
            <legend className={legendClass}>{labels.satisfaction}</legend>
            <p id="satisfaction-scale" className="mb-1.5 text-xs text-muted">{labels.satisfactionScale}</p>
            <div className="flex gap-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm">
                  <input type="radio" name="satisfaction" value={n} required /> {n}
                </label>
              ))}
            </div>
          </fieldset>
          <YesNo name="stillInUse" legend={labels.stillInUse} labels={labels} />
          <YesNo name="wouldRecommend" legend={labels.wouldRecommend} labels={labels} />
          <div>
            <Label htmlFor="issues">{labels.issues}</Label>
            <Textarea id="issues" name="issues" />
          </div>
          <div className="rounded-lg border border-line p-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="quoteConsent" value="true" className="mt-1" data-testid="quote-consent" />
              <span>
                <span className="font-medium">{labels.quoteConsent}</span>
                <span className="mt-0.5 block text-xs text-muted">{labels.quoteConsentHint}</span>
              </span>
            </label>
          </div>
          <div aria-live="assertive">
            {state && !state.ok && <p role="alert" className="text-sm text-rose-600">{labels[state.reason] ?? state.reason}</p>}
          </div>
          <Button type="submit" disabled={pending}>{labels.submit}</Button>
        </form>
      </Card>
    </div>
  );
}
