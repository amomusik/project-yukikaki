import { after } from "next/server";
import { publishedBriefIds, refreshGrantMatches } from "./store";

/**
 * Run grant matching after the response is sent (jGrants is rate-limited, so one brief takes
 * ~10–30 s). Call from server actions / route handlers only. Failures are logged (and recorded
 * in service_events by the guard); previous matches are kept.
 */
export function scheduleGrantRefresh(briefId: string) {
  after(() => refreshOne(briefId));
}

/** Refresh every published challenge, one after another (shares the jGrants rate limit). */
export function scheduleAllGrantRefresh() {
  after(async () => {
    for (const id of await publishedBriefIds()) await refreshOne(id);
  });
}

async function refreshOne(briefId: string) {
  try {
    const r = await refreshGrantMatches(briefId);
    console.info(`[grants] ${briefId}: ${r.count} matches`, r.warnings.length ? r.warnings : "");
  } catch (e) {
    console.error("[grants] refresh failed", briefId, e);
  }
}
