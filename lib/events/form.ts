import { jstLocalToDate } from "./format";
import type { EventInput } from "./store";
import { isUuid } from "@/lib/uuid";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Parse the host event form into an EventInput (date inputs are JST wall-clock). Validation happens in the store. */
export function parseEventForm(f: FormData): EventInput {
  const startsAt = jstLocalToDate(str(f, "startsAt"));
  const endsAt = jstLocalToDate(str(f, "endsAt"));
  return {
    title: { ja: str(f, "titleJa"), en: str(f, "titleEn") },
    summary: { ja: str(f, "summaryJa"), en: str(f, "summaryEn") },
    format: str(f, "format") as EventInput["format"],
    startsAt: startsAt ?? new Date(NaN),
    endsAt: endsAt ?? new Date(NaN),
    city: str(f, "city"),
    venueName: str(f, "venueName"),
    venueAddress: str(f, "venueAddress"),
    onlineUrl: str(f, "onlineUrl") || null,
    coverImage: str(f, "coverImage") || null,
    capacity: Number(str(f, "capacity")),
    briefIds: f.getAll("briefIds").map(String).filter(isUuid),
  };
}
