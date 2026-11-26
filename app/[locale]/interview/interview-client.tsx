"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { VoiceSession } from "@/components/voice-session";
import { Button, Card, Input, Label, Select, Textarea, buttonClass } from "@/components/ui";
import { submitTextInterview } from "./actions";

type Props = {
  locale: string;
  voiceAvailable: boolean;
  dynamicVariables: Record<string, string>;
  defaults: { businessName: string; industry: string; city: string; ward: string };
  labels: Record<string, string>;
};

export function InterviewClient({ locale, voiceAvailable, dynamicVariables, defaults, labels: l }: Props) {
  const [done, setDone] = useState(false);

  async function onEnded(conversationId: string) {
    setDone(true);
    await fetch("/api/interviews/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId }),
    });
  }

  if (done) {
    return (
      <Card className="text-center">
        <p className="text-lg">✅ {l.preparing}</p>
        <Link href="/me" className={buttonClass("primary", "mt-4")}>
          {l.toMe}
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="py-10">
        {voiceAvailable ? (
          <VoiceSession
            agent="interview"
            dynamicVariables={dynamicVariables}
            labels={{ start: l.start, stop: l.stop, connecting: l.connecting, listening: l.listening, speaking: l.speaking, micNote: l.micNote }}
            onEnded={onEnded}
          />
        ) : (
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">{l.voiceUnavailable}</p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">{l.textTitle}</h2>
        <p className="mb-5 text-sm text-muted">{l.textSubtitle}</p>
        <form action={submitTextInterview} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="business_id" value={dynamicVariables.business_id} />
          <div>
            <Label htmlFor="business_name">{l.businessName}</Label>
            <Input id="business_name" name="business_name" required defaultValue={defaults.businessName} />
          </div>
          <div>
            <Label htmlFor="industry">{l.industry}</Label>
            <Input id="industry" name="industry" required defaultValue={defaults.industry} />
          </div>
          <div>
            <Label htmlFor="city">{l.city}</Label>
            <Input id="city" name="city" required defaultValue={defaults.city} />
          </div>
          <div>
            <Label htmlFor="ward">{l.ward}</Label>
            <Input id="ward" name="ward" defaultValue={defaults.ward} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="problem">{l.problem}</Label>
            <Textarea id="problem" name="problem" required />
          </div>
          <div>
            <Label htmlFor="current_process">{l.currentProcess}</Label>
            <Textarea id="current_process" name="current_process" />
          </div>
          <div>
            <Label htmlFor="desired_outcome">{l.desiredOutcome}</Label>
            <Textarea id="desired_outcome" name="desired_outcome" />
          </div>
          <div>
            <Label htmlFor="tools_used">{l.toolsUsed}</Label>
            <Input id="tools_used" name="tools_used" />
          </div>
          <div>
            <Label htmlFor="hours_lost_per_week">{l.hoursLost}</Label>
            <Input id="hours_lost_per_week" name="hours_lost_per_week" type="number" min={0} max={80} step={0.5} inputMode="decimal" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="data_sensitivity">{l.sensitivity}</Label>
            <Select id="data_sensitivity" name="data_sensitivity" defaultValue="synthetic_ok">
              <option value="synthetic_ok">{l.sensSynthetic}</option>
              <option value="private">{l.sensPrivate}</option>
              <option value="public">{l.sensPublic}</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">{l.submit}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
