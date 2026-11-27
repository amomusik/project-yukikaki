"use server";

import { redirect } from "next/navigation";
import { isUuid } from "@/lib/uuid";
import { withdrawQuote } from "@/lib/testimonials";

/** POST-only (a link preview or mail scanner opening the GET page must not withdraw anything). */
export async function withdrawQuoteAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja") === "en" ? "en" : "ja";
  const e = String(formData.get("e") ?? "");
  const sig = String(formData.get("sig") ?? "");
  const ok = isUuid(e) && (await withdrawQuote(e, sig));
  redirect(`/${locale}/feedback/withdraw?done=${ok ? "1" : "0"}`);
}
