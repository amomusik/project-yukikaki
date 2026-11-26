import { NextResponse } from "next/server";
import { listUpcomingEvents } from "@/lib/events/store";

export const dynamic = "force-dynamic";

/** Public JSON: upcoming published events. Filters: ?city=&format=&month=YYYY-MM */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const events = await listUpcomingEvents({ city: q.get("city"), format: q.get("format"), month: q.get("month") });
  return NextResponse.json({
    events: events.map((e) => ({
      slug: e.slug,
      title: e.title,
      summary: e.summary,
      format: e.format,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      timezone: e.timezone,
      city: e.city,
      venueName: e.venueName,
      venueAddress: e.venueAddress,
      onlineUrl: e.onlineUrl,
      capacity: e.capacity,
      going: e.going,
      waitlist: e.waitlist,
      spotsLeft: Math.max(0, e.capacity - e.going),
      isDemo: e.isDemo,
    })),
  });
}
