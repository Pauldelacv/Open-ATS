/** iCalendar invitations (RFC 5545 / 5546) that every calendar client accepts. */

export type InviteMethod = "REQUEST" | "CANCEL" | "PUBLISH";

export type Invite = {
  method: InviteMethod;
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizer: { name: string; email: string };
  attendees: Array<{ name: string; email: string }>;
  now?: Date;
};

/** Text value escaping: backslash, semicolon, comma and line breaks. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Lines are folded at 75 octets, continuation lines start with a space. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    const limit = out.length === 0 ? 75 : 74;
    if (size + charSize > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += charSize;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** `20261105T130000Z` */
export function icsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

const quoteParam = (value: string) => `"${value.replace(/"/g, "'")}"`;

export function buildInvite(invite: Invite): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Open ATS//Interviews//FR",
    "CALSCALE:GREGORIAN",
    `METHOD:${invite.method}`,
    "BEGIN:VEVENT",
    `UID:${invite.uid}`,
    `SEQUENCE:${invite.sequence}`,
    `DTSTAMP:${icsDate(invite.now ?? new Date())}`,
    `DTSTART:${icsDate(invite.start)}`,
    `DTEND:${icsDate(invite.end)}`,
    `SUMMARY:${escapeText(invite.summary)}`,
    ...(invite.description ? [`DESCRIPTION:${escapeText(invite.description)}`] : []),
    ...(invite.location ? [`LOCATION:${escapeText(invite.location)}`] : []),
    ...(invite.url ? [`URL:${invite.url}`] : []),
    `ORGANIZER;CN=${quoteParam(invite.organizer.name)}:mailto:${invite.organizer.email}`,
    ...invite.attendees.map(
      (a) =>
        `ATTENDEE;CN=${quoteParam(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`,
    ),
    `STATUS:${invite.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
