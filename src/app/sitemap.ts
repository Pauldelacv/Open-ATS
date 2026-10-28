import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { listAllPublishedJobs } from "@/lib/services/jobs";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [orgs, jobs] = await Promise.all([
    db.select({ slug: organizations.slug, updatedAt: organizations.updatedAt }).from(organizations).where(eq(organizations.isDemo, false)),
    listAllPublishedJobs(),
  ]);
  const realOrgs = new Set(orgs.map((o) => o.slug));
  return [
    ...orgs.map((org) => ({
      url: appUrl(`/careers/${org.slug}`),
      lastModified: org.updatedAt,
      changeFrequency: "daily" as const,
      priority: 1,
    })),
    ...jobs
      .filter((job) => realOrgs.has(job.orgSlug))
      .map((job) => ({
        url: appUrl(`/careers/${job.orgSlug}/jobs/${job.slug}`),
        lastModified: job.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
  ];
}
