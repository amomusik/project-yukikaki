/** RFC 5545 iCalendar export for a single event (pure; used by the .ics route and RSVP email). */

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  start: Date;
  end: Date;
  /** Defaults to now; injectable for tests. */
  stamp?: Date;
  status?: "CONFIRMED" | "CANCELLED" | "TENTATIVE";
};

/** UTC basic format: 20261212T010000Z */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape TEXT values: backslash, semicolon, comma, newline. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (UTF-8 aware) with CRLF + space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (curLen + n > limit) {
      out.push(cur);
      cur = "";
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Project Yukikaki//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(e.stamp ?? new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    e.description ? `DESCRIPTION:${icsEscape(e.description)}` : null,
    e.location ? `LOCATION:${icsEscape(e.location)}` : null,
    e.url ? `URL:${e.url}` : null,
    `STATUS:${e.status ?? "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
