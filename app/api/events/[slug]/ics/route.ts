import { eventIcs } from "@/lib/events/email";
import { getEventBySlug } from "@/lib/events/store";

export const dynamic = "force-dynamic";

/** Add-to-calendar: RFC 5545 .ics for a published (or cancelled) event. ?locale=ja|en picks the title language. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") === "ja" ? "ja" : "en";
  const ev = await getEventBySlug(slug);
  if (!ev || ev.status === "draft") return new Response("Not found", { status: 404 });
  const ics = eventIcs(ev, locale, url.origin);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ev.slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
