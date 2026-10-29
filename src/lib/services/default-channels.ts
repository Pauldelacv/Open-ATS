import type { Locale } from "@/lib/db/schema";

// Channels created with every organisation. drizzle/0001_distribution.sql holds the same list
// for organisations that existed before distribution.
export const defaultChannels: Record<Locale, Array<{ name: string; slug: string }>> = {
  fr: [
    { name: "LinkedIn", slug: "linkedin" },
    { name: "Indeed", slug: "indeed" },
    { name: "Welcome to the Jungle", slug: "welcome-to-the-jungle" },
    { name: "France Travail", slug: "france-travail" },
    { name: "HelloWork", slug: "hellowork" },
    { name: "Réseaux sociaux", slug: "reseaux-sociaux" },
    { name: "Cooptation", slug: "cooptation" },
  ],
  en: [
    { name: "LinkedIn", slug: "linkedin" },
    { name: "Indeed", slug: "indeed" },
    { name: "Glassdoor", slug: "glassdoor" },
    { name: "Social media", slug: "social-media" },
    { name: "Referral", slug: "referral" },
  ],
};

export function defaultChannelRows(organizationId: string, locale: Locale) {
  return defaultChannels[locale].map((c, position) => ({ organizationId, ...c, position }));
}
