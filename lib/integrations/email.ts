import { Resend } from "resend";
import { configured, env } from "@/lib/env";
import { impactCheckEmail } from "@/emails/impact-check";
import { waitlistConfirmEmail } from "@/emails/waitlist-confirm";
import type { RoadmapFeature } from "@/lib/party";
import { NotConfiguredError } from "./_guard";

/**
 * Resend — https://resend.com. Callers wrap this in withFallback; when it fails
 * the impact link is logged and shown in /admin with a Copy button instead.
 */
export async function sendImpactCheckEmail(input: {
  to: string;
  link: string;
  businessName: string;
  teamName: string;
  leadName: string;
  locale: "ja" | "en";
}): Promise<{ id: string }> {
  if (!configured.resend()) throw new NotConfiguredError("resend");
  const resend = new Resend(env.RESEND_API_KEY);
  const { subject, html, text } = impactCheckEmail(input);
  const { data, error } = await resend.emails.send({ from: env.EMAIL_FROM, to: input.to, subject, html, text });
  if (error || !data) throw new Error(`Resend: ${error?.message ?? "no id returned"}`);
  return { id: data.id };
}

/** Roadmap waitlist confirmation (coming-soon features) in the signer's locale. */
export async function sendWaitlistEmail(input: {
  to: string;
  org?: string | null;
  locale: "ja" | "en";
  features: RoadmapFeature[];
}): Promise<{ id: string }> {
  if (!configured.resend()) throw new NotConfiguredError("resend");
  const resend = new Resend(env.RESEND_API_KEY);
  const { subject, html, text } = waitlistConfirmEmail({ locale: input.locale, org: input.org, features: input.features, appUrl: env.APP_URL });
  const { data, error } = await resend.emails.send({ from: env.EMAIL_FROM, to: input.to, subject, html, text });
  if (error || !data) throw new Error(`Resend: ${error?.message ?? "no id returned"}`);
  return { id: data.id };
}
