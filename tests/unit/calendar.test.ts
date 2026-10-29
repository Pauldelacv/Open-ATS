import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { busyIntervals, mergeIntervals } from "@/lib/calendar/busy";
import { buildInvite, escapeText, foldLine } from "@/lib/calendar/ics";
import { freeSlots, suggestSlots } from "@/lib/calendar/slots";
import { isPrivateAddress } from "@/lib/net/safe-fetch";
import { addDays, weekdayOf, zonedDate, zonedToUtc } from "@/lib/time/zoned";
import { decryptSecret, encryptSecret } from "@/lib/utils/crypto";

const TZ = "Europe/Paris";
const iso = (d: Date) => d.toISOString();

describe("zoned time", () => {
  it("converts wall-clock times across daylight saving changes", () => {
    expect(iso(zonedToUtc("2026-10-23", "14:00", TZ))).toBe("2026-10-23T12:00:00.000Z");
    expect(iso(zonedToUtc("2026-10-26", "14:00", TZ))).toBe("2026-10-26T13:00:00.000Z");
    expect(iso(zonedToUtc("2026-03-29", "02:30", TZ))).toBe("2026-03-29T01:30:00.000Z");
    expect(iso(zonedToUtc("2026-11-05", "09:00", "America/New_York"))).toBe(
      "2026-11-05T14:00:00.000Z",
    );
  });

  it("does calendar arithmetic without a zone", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(weekdayOf("2026-11-02")).toBe(1);
    expect(weekdayOf("2026-11-08")).toBe(7);
    expect(zonedDate(new Date("2026-11-04T23:30:00Z"), TZ)).toBe("2026-11-05");
  });
});

describe("iCalendar invitations", () => {
  it("escapes text and folds long lines at 75 octets", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe(String.raw`a\,b\;c\\d\ne`);
    const folded = foldLine(`DESCRIPTION:${"é".repeat(60)}`);
    for (const line of folded.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .slice(1)
        .every((l) => l.startsWith(" ")),
    ).toBe(true);
  });

  it("writes a request with organiser, attendees and UTC times", () => {
    const ics = buildInvite({
      method: "REQUEST",
      uid: "int-1@jobs.example",
      sequence: 2,
      start: new Date("2026-11-05T13:00:00Z"),
      end: new Date("2026-11-05T13:45:00Z"),
      summary: "Entretien, Maison Pivert",
      location: "Visio : https://meet.jit.si/abc",
      organizer: { name: "Maison Pivert", email: "jobs@maison-pivert.example" },
      attendees: [{ name: "Marion Lefort", email: "marion@example.com" }],
      now: new Date("2026-10-29T10:00:00Z"),
    });
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("DTSTART:20261105T130000Z");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("SUMMARY:Entretien\\, Maison Pivert");
    expect(ics).toContain('ORGANIZER;CN="Maison Pivert":mailto:jobs@maison-pivert.example');
    expect(ics).toContain('ATTENDEE;CN="Marion Lefort"');
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("busy times from a calendar feed", () => {
  const text = readFileSync(path.join(__dirname, "../fixtures/calendar.ics"), "utf8");
  const busy = busyIntervals(
    text,
    { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-15T00:00:00Z") },
    TZ,
  ).map((i) => [iso(i.start), iso(i.end)]);

  it("expands recurring events with their exceptions", () => {
    expect(busy).not.toContainEqual(["2026-11-03T09:00:00.000Z", "2026-11-03T10:00:00.000Z"]);
    expect(busy).toContainEqual(["2026-11-10T15:00:00.000Z", "2026-11-10T16:00:00.000Z"]);
    expect(busy).not.toContainEqual(["2026-11-10T09:00:00.000Z", "2026-11-10T10:00:00.000Z"]);
  });

  it("skips free and cancelled events, keeps all-day, UTC and floating ones", () => {
    expect(busy.some(([s]) => s! >= "2026-11-05T08" && s! < "2026-11-05T20")).toBe(false);
    expect(busy).toContainEqual(["2026-11-05T23:00:00.000Z", "2026-11-06T23:00:00.000Z"]);
    expect(busy).toContainEqual(["2026-11-04T13:00:00.000Z", "2026-11-04T14:00:00.000Z"]);
    expect(busy).toContainEqual(["2026-11-09T08:00:00.000Z", "2026-11-09T08:30:00.000Z"]);
  });

  it("merges overlapping intervals", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 10, 2, h));
    expect(
      mergeIntervals([
        { start: d(10), end: d(12) },
        { start: d(9), end: d(11) },
        { start: d(14), end: d(15) },
      ]).map((i) => [i.start.getUTCHours(), i.end.getUTCHours()]),
    ).toEqual([
      [9, 12],
      [14, 15],
    ]);
  });
});

describe("free slots", () => {
  const week = { workingDays: [1, 2, 3, 4, 5], workStart: "09:00", workEnd: "12:00" };

  it("keeps working hours common to everyone, outside busy times and after the notice", () => {
    const slots = freeSlots({
      from: "2026-11-06",
      to: "2026-11-09",
      timeZone: TZ,
      durationMinutes: 60,
      notBefore: new Date("2026-11-06T08:30:00Z"),
      interviewers: [
        { ...week, busy: [] },
        {
          ...week,
          workStart: "10:00",
          busy: [
            { start: new Date("2026-11-09T09:00:00Z"), end: new Date("2026-11-09T10:00:00Z") },
          ],
        },
      ],
    }).map((s) => iso(s.start));
    expect(slots).toEqual([
      "2026-11-06T09:00:00.000Z",
      "2026-11-06T09:30:00.000Z",
      "2026-11-06T10:00:00.000Z",
      "2026-11-09T10:00:00.000Z",
    ]);
  });

  it("suggests a morning and an afternoon slot per day", () => {
    const slots = freeSlots({
      from: "2026-11-09",
      to: "2026-11-11",
      timeZone: TZ,
      durationMinutes: 45,
      notBefore: new Date("2026-11-01T00:00:00Z"),
      interviewers: [
        { workingDays: [1, 2, 3, 4, 5], workStart: "09:00", workEnd: "18:00", busy: [] },
      ],
    });
    const picked = suggestSlots(slots, TZ, { max: 5 }).map((s) => iso(s.start));
    expect(picked).toEqual([
      "2026-11-09T08:00:00.000Z",
      "2026-11-09T11:00:00.000Z",
      "2026-11-10T08:00:00.000Z",
      "2026-11-10T11:00:00.000Z",
      "2026-11-11T08:00:00.000Z",
    ]);
  });
});

describe("server-side requests", () => {
  it("refuses private and local addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "0.0.0.0",
    ])
      expect(isPrivateAddress(address)).toBe(true);
    for (const address of ["142.250.74.110", "2a00:1450:4007::200e"])
      expect(isPrivateAddress(address)).toBe(false);
  });
});

describe("stored secrets", () => {
  it("round-trips and refuses another key", () => {
    const sealed = encryptSecret("https://calendar.example/private.ics", "secret-a");
    expect(sealed).not.toContain("calendar.example");
    expect(decryptSecret(sealed, "secret-a")).toBe("https://calendar.example/private.ics");
    expect(decryptSecret(sealed, "secret-b")).toBeNull();
  });
});
