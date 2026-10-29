import { addDays, weekdayOf, zonedDate, zonedToUtc } from "@/lib/time/zoned";
import { mergeIntervals, type Interval } from "./busy";

export type Availability = {
  /** 1 = Monday … 7 = Sunday. */
  workingDays: number[];
  workStart: string;
  workEnd: string;
  busy: Interval[];
};

/**
 * Start times between `from` and `to` (calendar dates, inclusive) where every interviewer is
 * within working hours and free for `durationMinutes`, on a `stepMinutes` grid, not before
 * `notBefore`.
 */
export function freeSlots(input: {
  from: string;
  to: string;
  timeZone: string;
  durationMinutes: number;
  stepMinutes?: number;
  notBefore: Date;
  interviewers: Availability[];
}): Interval[] {
  const step = (input.stepMinutes ?? 30) * 60_000;
  const duration = input.durationMinutes * 60_000;
  const busy = mergeIntervals(input.interviewers.flatMap((a) => a.busy));
  const slots: Interval[] = [];
  for (let day = input.from; day <= input.to; day = addDays(day, 1)) {
    const weekday = weekdayOf(day);
    if (!input.interviewers.every((a) => a.workingDays.includes(weekday))) continue;
    // The common part of everyone's working hours that day.
    const dayStart = Math.max(
      ...input.interviewers.map((a) => zonedToUtc(day, a.workStart, input.timeZone).getTime()),
    );
    const dayEnd = Math.min(
      ...input.interviewers.map((a) => zonedToUtc(day, a.workEnd, input.timeZone).getTime()),
    );
    for (let start = dayStart; start + duration <= dayEnd; start += step) {
      if (start < input.notBefore.getTime()) continue;
      const end = start + duration;
      const clash = busy.some((b) => b.start.getTime() < end && b.end.getTime() > start);
      if (!clash) slots.push({ start: new Date(start), end: new Date(end) });
    }
  }
  return slots;
}

/**
 * A short list to offer by default: at most `perDay` slots a day, morning and afternoon when
 * possible, spread over as many days as needed to reach `max`.
 */
export function suggestSlots(
  slots: Interval[],
  timeZone: string,
  options: { max?: number; perDay?: number } = {},
): Interval[] {
  const max = options.max ?? 6;
  const perDay = options.perDay ?? 2;
  const byDay = new Map<string, Interval[]>();
  for (const slot of slots) {
    const day = zonedDate(slot.start, timeZone);
    byDay.set(day, [...(byDay.get(day) ?? []), slot]);
  }
  const picked: Interval[] = [];
  for (const daySlots of byDay.values()) {
    if (picked.length >= max) break;
    const chosen = [daySlots[0]!];
    if (perDay > 1 && daySlots.length > 1) {
      // The first slot at least three hours after the first one, else the last of the day.
      const later =
        daySlots.find((s) => s.start.getTime() - daySlots[0]!.start.getTime() >= 3 * 3600_000) ??
        daySlots[daySlots.length - 1]!;
      if (later !== daySlots[0]) chosen.push(later);
    }
    picked.push(...chosen.slice(0, Math.min(perDay, max - picked.length)));
  }
  return picked;
}
