"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { scheduleAllGrantRefresh, scheduleGrantRefresh } from "@/lib/grants/schedule";
import { isUuid } from "@/lib/uuid";

/** Host-only: "Find grants" / refresh for one brief (admin card, challenge page). Runs via after(). */
export async function refreshGrantsAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  await requireRole(locale, "host");
  const briefId = String(formData.get("briefId") ?? "");
  if (!isUuid(briefId)) return;
  scheduleGrantRefresh(briefId);
  revalidatePath(`/${locale}/admin`);
  revalidatePath(`/${locale}/challenges/${briefId}`);
}

/** Host-only: refresh grants for every published challenge. Runs via after(). */
export async function refreshAllGrantsAction(formData: FormData) {
  const locale = String(formData.get("locale") ?? "ja");
  await requireRole(locale, "host");
  scheduleAllGrantRefresh();
  revalidatePath(`/${locale}/grants`);
}
