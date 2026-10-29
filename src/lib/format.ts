import type { SalaryPeriod } from "@/lib/db/schema";

const DAY = 24 * 3600 * 1000;

function tz() {
  return process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Paris";
}

/** « il y a 3 jours » under a week, « 12 mars 2026 » beyond (year omitted for the current year). */
export function formatRelative(
  value: Date | string,
  locale: string,
  now: Date = new Date(),
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (abs < 60_000) return locale.startsWith("fr") ? "à l'instant" : "just now";
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / 3600_000), "hour");
  if (abs < 7 * DAY) return rtf.format(Math.round(diff / DAY), "day");
  return formatDate(date, locale, now);
}

export function formatDate(value: Date | string, locale: string, now: Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
    timeZone: tz(),
  }).format(date);
}

export function formatDateTime(value: Date | string, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: tz(),
  }).format(date);
}

export function formatAmount(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** « 45 000 € – 55 000 € par an », « À partir de 45 000 € par an », … */
export function formatSalary(
  job: {
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string;
    salaryPeriod: SalaryPeriod;
  },
  locale: string,
  labels: { period: string; from: string; upTo: string },
): string | null {
  const { salaryMin: min, salaryMax: max, salaryCurrency: currency } = job;
  if (min === null && max === null) return null;
  const f = (n: number) => formatAmount(n, currency, locale);
  let range: string;
  if (min !== null && max !== null) range = min === max ? f(min) : `${f(min)} – ${f(max)}`;
  else if (min !== null) range = `${labels.from} ${f(min)}`;
  else range = `${labels.upTo} ${f(max!)}`;
  return `${range} ${labels.period}`;
}
