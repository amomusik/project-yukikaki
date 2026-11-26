"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { saveEventAction, type SaveEventState } from "./actions";

export type EventFormValues = {
  eventId?: string;
  status?: string;
  titleJa: string;
  titleEn: string;
  summaryJa: string;
  summaryEn: string;
  format: string;
  startsAt: string;
  endsAt: string;
  city: string;
  venueName: string;
  venueAddress: string;
  onlineUrl: string;
  coverImage: string;
  capacity: number;
  briefIds: string[];
};

export type ChallengeOption = { id: string; title: string; city: string; industry: string };

/** Host-only create/edit form. Dates are entered in JST. */
export function EventForm({ locale, values, challenges }: { locale: string; values: EventFormValues; challenges: ChallengeOption[] }) {
  const t = useTranslations("events");
  const [state, action, pending] = useActionState<SaveEventState, FormData>(saveEventAction, undefined);
  const isEdit = Boolean(values.eventId);
  return (
    <form action={action} className="space-y-6" data-testid="event-form">
      <input type="hidden" name="locale" value={locale} />
      {values.eventId && <input type="hidden" name="eventId" value={values.eventId} />}
      {state?.error && (
        <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">
          {t("form.error")}: {state.error}
        </p>
      )}

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="titleEn">{t("form.titleEn")}</Label>
            <Input id="titleEn" name="titleEn" required maxLength={120} defaultValue={values.titleEn} />
          </div>
          <div>
            <Label htmlFor="titleJa">{t("form.titleJa")}</Label>
            <Input id="titleJa" name="titleJa" required maxLength={120} defaultValue={values.titleJa} lang="ja" />
          </div>
          <div>
            <Label htmlFor="summaryEn">{t("form.summaryEn")}</Label>
            <Textarea id="summaryEn" name="summaryEn" required rows={5} maxLength={2000} defaultValue={values.summaryEn} />
          </div>
          <div>
            <Label htmlFor="summaryJa">{t("form.summaryJa")}</Label>
            <Textarea id="summaryJa" name="summaryJa" required rows={5} maxLength={2000} defaultValue={values.summaryJa} lang="ja" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="format">{t("form.format")}</Label>
            <Select id="format" name="format" defaultValue={values.format}>
              {(["hackathon", "charrette", "test_kitchen"] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`format.${f}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="startsAt">{t("form.startsAt")}</Label>
            <Input id="startsAt" name="startsAt" type="datetime-local" required defaultValue={values.startsAt} />
          </div>
          <div>
            <Label htmlFor="endsAt">{t("form.endsAt")}</Label>
            <Input id="endsAt" name="endsAt" type="datetime-local" required defaultValue={values.endsAt} />
          </div>
        </div>
        <p className="text-xs text-slate-500">{t("form.jstNote")}</p>
      </Card>

      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="city">{t("form.city")}</Label>
            <Input id="city" name="city" required maxLength={80} defaultValue={values.city} placeholder="Sapporo" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="venueName">{t("form.venueName")}</Label>
            <Input id="venueName" name="venueName" required maxLength={160} defaultValue={values.venueName} />
          </div>
        </div>
        <div>
          <Label htmlFor="venueAddress">{t("form.venueAddress")}</Label>
          <Input id="venueAddress" name="venueAddress" required maxLength={300} defaultValue={values.venueAddress} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="capacity">{t("form.capacity")}</Label>
            <Input id="capacity" name="capacity" type="number" min={1} max={5000} required defaultValue={values.capacity} />
          </div>
          <div>
            <Label htmlFor="onlineUrl">{t("form.onlineUrl")}</Label>
            <Input id="onlineUrl" name="onlineUrl" type="url" defaultValue={values.onlineUrl} placeholder="https://" />
          </div>
          <div>
            <Label htmlFor="coverImage">{t("form.coverImage")}</Label>
            <Input id="coverImage" name="coverImage" type="url" defaultValue={values.coverImage} placeholder="https://" />
          </div>
        </div>
      </Card>

      <Card>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("form.challenges")}</legend>
          <p className="mt-1 text-xs text-slate-500">{t("form.challengesHint")}</p>
          {challenges.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t("noChallenges")}</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {challenges.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                    <input type="checkbox" name="briefIds" value={c.id} defaultChecked={values.briefIds.includes(c.id)} className="mt-0.5" />
                    <span>
                      <span className="font-medium">{c.title}</span>
                      <span className="block text-xs text-slate-500">
                        {c.city} · {c.industry}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </Card>

      <div className="flex flex-wrap gap-3">
        {(!isEdit || values.status !== "published") && (
          <Button type="submit" name="intent" value="publish" disabled={pending} data-testid="event-publish">
            {t("form.publish")}
          </Button>
        )}
        <Button type="submit" name="intent" value="draft" variant={isEdit && values.status === "published" ? "primary" : "secondary"} disabled={pending} data-testid="event-save">
          {isEdit ? t("form.save") : t("form.saveDraft")}
        </Button>
      </div>
    </form>
  );
}
