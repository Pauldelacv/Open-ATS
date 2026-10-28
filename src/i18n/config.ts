export const locales = ["fr", "en"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "fr";
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Picks the first supported language from an Accept-Language header. */
export function localeFromAcceptLanguage(header: string | null | undefined): AppLocale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return ranked.map((r) => r.lang).find(isLocale);
}

export function timeZone(): string {
  return process.env.APP_TIMEZONE || "Europe/Paris";
}
