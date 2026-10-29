import { cache } from "react";
import { brandPalette } from "@/lib/brand";
import { mediaUrl } from "@/lib/media";
import { getPublicOrganization } from "@/lib/services/organizations";

/** Organisation of a career site, memoised for the request. */
export const getCareerOrganization = cache(async (slug: string) => {
  const org = await getPublicOrganization(slug);
  if (!org) return null;
  return {
    ...org,
    palette: brandPalette(org.brandColor),
    logoUrl: org.logoKey ? mediaUrl(org.logoKey) : null,
    coverUrl: org.coverKey ? mediaUrl(org.coverKey) : null,
  };
});

export type CareerOrganization = NonNullable<Awaited<ReturnType<typeof getCareerOrganization>>>;

/** `?src=` of a tracked link, when it has the shape of a channel short name. */
export function trackedSource(value: string | string[] | undefined): string | null {
  const source = Array.isArray(value) ? value[0] : value;
  return source && /^[a-z0-9][a-z0-9-]{0,59}$/.test(source) ? source : null;
}
