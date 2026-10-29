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
