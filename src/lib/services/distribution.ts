import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, distributionChannels, jobs, organizations } from "@/lib/db/schema";
import { appUrl } from "@/lib/env";
import { buildJobFeed } from "@/lib/feed";
import { formatSalary } from "@/lib/format";
import { serverTranslator } from "@/i18n/server";
import { assertCan, NotFoundError } from "@/lib/permissions";
import { richTextToPlain } from "@/lib/sanitize";
import { slugify } from "@/lib/utils/text";
import { getAccessibleJob } from "./access";
import type { Ctx } from "./types";

/** Short names allowed in `?src=`: lower-case letters, digits and dashes. */
export const CHANNEL_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

export function careerJobUrl(orgSlug: string, jobSlug: string, channelSlug?: string | null) {
  const path = `/careers/${orgSlug}/jobs/${jobSlug}`;
  return appUrl(channelSlug ? `${path}?src=${channelSlug}` : path);
}

export function feedUrl(orgSlug: string, channelSlug?: string | null) {
  const path = `/careers/${orgSlug}/jobs.xml`;
  return appUrl(channelSlug ? `${path}?src=${channelSlug}` : path);
}

/* --------------------------------- Channels -------------------------------- */

export async function listChannels(ctx: Ctx) {
  return db
    .select({
      id: distributionChannels.id,
      name: distributionChannels.name,
      slug: distributionChannels.slug,
      applications: sql<number>`(select count(*)::int from ${applications} a where a.channel_id = "distribution_channels"."id")`,
    })
    .from(distributionChannels)
    .where(eq(distributionChannels.organizationId, ctx.orgId))
    .orderBy(asc(distributionChannels.position), asc(distributionChannels.name));
}

export class ChannelNameError extends Error {
  constructor() {
    super("Invalid channel name");
    this.name = "ChannelNameError";
  }
}

async function uniqueChannelSlug(orgId: string, name: string, excludeId?: string) {
  const base = slugify(name, 40);
  if (!CHANNEL_SLUG.test(base) || base === "item") throw new ChannelNameError();
  const taken = new Set(
    (
      await db
        .select({ id: distributionChannels.id, slug: distributionChannels.slug })
        .from(distributionChannels)
        .where(eq(distributionChannels.organizationId, orgId))
    )
      .filter((c) => c.id !== excludeId)
      .map((c) => c.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  throw new ChannelNameError();
}

export async function createChannel(ctx: Ctx, name: string) {
  assertCan(ctx.role, "job:manage");
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new ChannelNameError();
  const slug = await uniqueChannelSlug(ctx.orgId, clean);
  const [last] = await db
    .select({ position: sql<number>`coalesce(max(${distributionChannels.position}), -1)::int` })
    .from(distributionChannels)
    .where(eq(distributionChannels.organizationId, ctx.orgId));
  const [row] = await db
    .insert(distributionChannels)
    .values({ organizationId: ctx.orgId, name: clean, slug, position: (last?.position ?? -1) + 1 })
    .returning();
  return row!;
}

/** Renaming keeps the short name, so links already shared keep their attribution. */
export async function renameChannel(ctx: Ctx, id: string, name: string) {
  assertCan(ctx.role, "job:manage");
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new ChannelNameError();
  const [row] = await db
    .update(distributionChannels)
    .set({ name: clean })
    .where(and(eq(distributionChannels.id, id), eq(distributionChannels.organizationId, ctx.orgId)))
    .returning();
  if (!row) throw new NotFoundError("Channel");
  return row;
}

/** Applications keep the channel name; links with this short name then count as direct. */
export async function deleteChannel(ctx: Ctx, id: string) {
  assertCan(ctx.role, "job:manage");
  await db
    .delete(distributionChannels)
    .where(
      and(eq(distributionChannels.id, id), eq(distributionChannels.organizationId, ctx.orgId)),
    );
}

/** Channel of a tracked link, for an application coming from the career site. */
export async function channelForSource(orgId: string, source: string | null | undefined) {
  if (!source || !CHANNEL_SLUG.test(source)) return null;
  const [row] = await db
    .select({ id: distributionChannels.id, name: distributionChannels.name })
    .from(distributionChannels)
    .where(
      and(eq(distributionChannels.organizationId, orgId), eq(distributionChannels.slug, source)),
    );
  return row ?? null;
}

/* ----------------------------------- Jobs ---------------------------------- */

/** Plain-text version of the ad, ready to paste into a job board form. */
function adText(job: typeof jobs.$inferSelect, locale: "fr" | "en", applyUrl: string): string {
  // French typography puts a space before the colon.
  const sep = locale === "fr" ? " : " : ": ";
  const tj = serverTranslator(locale, "jobs");
  const tc = serverTranslator(locale, "careers.job");
  const salary = formatSalary(job, locale, {
    period: tj(`salaryPeriod.${job.salaryPeriod}`),
    from: tc("salaryFrom"),
    upTo: tc("salaryUpTo"),
  });
  const details = [
    `${tc("contract")}${sep}${tj(`contract.${job.contract}`)}`,
    job.location ? `${tc("location")}${sep}${job.location}` : null,
    `${tc("remote")}${sep}${tj(`remote.${job.remote}`)}`,
    salary ? `${tc("salary")}${sep}${salary}` : null,
  ].filter(Boolean);
  // List items keep a dash so that pasted ads still read as lists.
  const description = richTextToPlain(job.descriptionHtml.replace(/<li>/g, "<li>- "))
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
  const text = [job.title, "", ...details, "", description, "", `${tc("apply")}${sep}${applyUrl}`]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

export async function getJobDistribution(ctx: Ctx, jobId: string) {
  assertCan(ctx.role, "job:manage");
  const job = await getAccessibleJob(ctx, jobId);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const channels = await db
    .select()
    .from(distributionChannels)
    .where(eq(distributionChannels.organizationId, ctx.orgId))
    .orderBy(asc(distributionChannels.position), asc(distributionChannels.name));
  const counts = await db
    .select({
      source: applications.source,
      channelId: applications.channelId,
      channelName: applications.channelName,
      total: count(),
    })
    .from(applications)
    .where(and(eq(applications.jobId, job.id), eq(applications.organizationId, ctx.orgId)))
    .groupBy(applications.source, applications.channelId, applications.channelName);

  const byChannel = new Map<string, number>();
  let direct = 0;
  let manual = 0;
  const removed = new Map<string, number>();
  for (const row of counts) {
    if (row.channelId)
      byChannel.set(row.channelId, (byChannel.get(row.channelId) ?? 0) + row.total);
    else if (row.channelName)
      removed.set(row.channelName, (removed.get(row.channelName) ?? 0) + row.total);
    else if (row.source === "career_site") direct += row.total;
    else manual += row.total;
  }
  const locale = org!.locale;
  return {
    job: { id: job.id, slug: job.slug, status: job.status, inFeeds: job.inFeeds },
    directUrl: careerJobUrl(org!.slug, job.slug),
    direct,
    manual,
    channels: channels.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      url: careerJobUrl(org!.slug, job.slug, c.slug),
      applications: byChannel.get(c.id) ?? 0,
    })),
    removedChannels: [...removed.entries()].map(([name, total]) => ({ name, applications: total })),
    ad: adText(job, locale, careerJobUrl(org!.slug, job.slug)),
    feedUrl: feedUrl(org!.slug),
  };
}

export type JobDistribution = Awaited<ReturnType<typeof getJobDistribution>>;

export async function setJobInFeeds(ctx: Ctx, jobId: string, inFeeds: boolean) {
  assertCan(ctx.role, "job:manage");
  const job = await getAccessibleJob(ctx, jobId);
  await db
    .update(jobs)
    .set({ inFeeds })
    .where(and(eq(jobs.id, job.id), eq(jobs.organizationId, ctx.orgId)));
}

/* ----------------------------------- Feed ---------------------------------- */

/** XML feed of an organisation's published jobs, links tagged with the channel if any. */
export async function organizationFeed(orgSlug: string, source: string | null) {
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug));
  if (!org) return null;
  const channel = await channelForSource(org.id, source);
  const rows = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.organizationId, org.id), eq(jobs.status, "published"), eq(jobs.inFeeds, true)),
    )
    .orderBy(sql`${jobs.publishedAt} desc nulls last`);
  const tj = serverTranslator(org.locale, "jobs");
  const tc = serverTranslator(org.locale, "careers.job");
  return buildJobFeed({
    publisher: org.name,
    publisherUrl: appUrl(`/careers/${org.slug}`),
    company: org.name,
    jobs: rows.map((job) => ({
      id: job.id,
      title: job.title,
      url: careerJobUrl(org.slug, job.slug, channel ? source : null),
      publishedAt: job.publishedAt ?? job.updatedAt,
      city: job.location,
      department: job.department,
      contract: job.contract,
      remote: job.remote,
      descriptionHtml: job.descriptionHtml,
      salary: formatSalary(job, org.locale, {
        period: tj(`salaryPeriod.${job.salaryPeriod}`),
        from: tc("salaryFrom"),
        upTo: tc("salaryUpTo"),
      }),
    })),
  });
}
