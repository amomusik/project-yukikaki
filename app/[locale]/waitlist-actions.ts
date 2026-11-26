"use server";

import { headers } from "next/headers";
import { joinWaitlist, type WaitlistResult } from "@/lib/waitlist";

/** Shared roadmap (coming soon) waitlist signup from the landing page. */
export async function joinWaitlistAction(_: WaitlistResult | null, formData: FormData): Promise<WaitlistResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const field = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : undefined;
  };
  // The Resend id stays server-side (logged); the client only learns whether an email went out.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { emailId, ...result } = await joinWaitlist(
    {
      email: field("email") ?? "",
      org: field("org"),
      role: (field("role") ?? "") as never,
      locale: (field("locale") ?? "en") as never,
      features: formData.getAll("features").filter((v): v is string => typeof v === "string") as never,
      website: field("website"),
    },
    ip,
  );
  return result as WaitlistResult;
}
