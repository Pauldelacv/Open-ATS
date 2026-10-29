import ICAL from "ical.js";
import { zonedToUtc } from "@/lib/time/zoned";

export type Interval = { start: Date; end: Date };

const MAX_OCCURRENCES = 5000;

function isIanaZone(tzid: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tzid });
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * An iCalendar time as an instant. All-day values start at midnight in `timeZone`; floating
 * times and unknown TZIDs without a VTIMEZONE are read in their TZID when Intl knows it, else
 * in `timeZone`.
 */
function toInstant(time: ICAL.Time, tzid: string | null, timeZone: string): Date {
  const date = `${time.year}-${pad(time.month)}-${pad(time.day)}`;
  if (time.isDate) return zonedToUtc(date, "00:00", timeZone);
  const zone = time.zone;
  const floating = !zone || zone === ICAL.Timezone.localTimezone || zone.tzid === "floating";
  if (!floating) return time.toJSDate();
  const fallback = tzid && isIanaZone(tzid) ? tzid : timeZone;
  return zonedToUtc(date, `${pad(time.hour)}:${pad(time.minute)}`, fallback);
}

function isFree(component: ICAL.Component): boolean {
  const transp = String(component.getFirstPropertyValue("transp") ?? "").toUpperCase();
  const status = String(component.getFirstPropertyValue("status") ?? "").toUpperCase();
  return transp === "TRANSPARENT" || status === "CANCELLED";
}

/** Sorted, non-overlapping intervals. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
    } else merged.push({ start: interval.start, end: interval.end });
  }
  return merged;
}

/**
 * Busy times of an iCalendar feed between `from` and `to`: recurring events expanded with
 * their exceptions, free (transparent) and cancelled events left out.
 */
export function busyIntervals(
  icsText: string,
  range: { from: Date; to: Date },
  timeZone: string,
): Interval[] {
  const root = new ICAL.Component(ICAL.parse(icsText));
  for (const vtimezone of root.getAllSubcomponents("vtimezone")) {
    const tz = new ICAL.Timezone(vtimezone);
    if (tz.tzid && !ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz);
  }
  const events = root.getAllSubcomponents("vevent").map((c) => new ICAL.Event(c));
  const masters = new Map<string, ICAL.Event>();
  for (const event of events) if (!event.isRecurrenceException()) masters.set(event.uid, event);
  for (const event of events) {
    if (event.isRecurrenceException()) masters.get(event.uid)?.relateException(event);
  }

  const busy: Interval[] = [];
  const add = (start: Date, end: Date) => {
    if (end > range.from && start < range.to && end > start) busy.push({ start, end });
  };
  for (const event of masters.values()) {
    const tzid =
      (event.component.getFirstProperty("dtstart")?.getParameter("tzid") as string) ?? null;
    if (!event.isRecurring()) {
      if (isFree(event.component) || !event.startDate) continue;
      const start = toInstant(event.startDate, tzid, timeZone);
      const end = event.endDate ? toInstant(event.endDate, tzid, timeZone) : start;
      add(start, end);
      continue;
    }
    const iterator = event.iterator();
    for (
      let i = 0, next = iterator.next();
      next && i < MAX_OCCURRENCES;
      i++, next = iterator.next()
    ) {
      const details = event.getOccurrenceDetails(next);
      const start = toInstant(details.startDate, tzid, timeZone);
      if (start >= range.to) break;
      if (isFree(details.item.component)) continue;
      add(start, toInstant(details.endDate, tzid, timeZone));
    }
  }
  return mergeIntervals(busy);
}
