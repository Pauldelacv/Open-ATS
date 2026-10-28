import { MapPin, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Mark } from "@/components/ui/mark";
import { cn } from "@/lib/cn";
import { requireContext } from "@/lib/context";
import type { JobStatus } from "@/lib/db/schema";
import { formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import { jobStatusCounts, listJobs } from "@/lib/services/jobs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("jobs");
  return { title: t("title") };
}

const tabs: JobStatus[] = ["published", "draft", "archived"];

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const ctx = await requireContext();
  const t = await getTranslations("jobs");
  const locale = await getLocale();
  const params = await searchParams;
  const counts = await jobStatusCounts(ctx);
  const requested =
    typeof params.status === "string" && tabs.includes(params.status as JobStatus)
      ? (params.status as JobStatus)
      : null;
  const status: JobStatus =
    requested ?? (counts.published === 0 && counts.draft > 0 ? "draft" : "published");
  const list = await listJobs(ctx, status);
  const canManage = can(ctx.role, "job:manage");
  const total = counts.published + counts.draft + counts.archived;
  const now = new Date();

  const createButton = canManage ? (
    <Button asChild variant="primary">
      <Link href="/jobs/new">
        <Plus aria-hidden="true" />
        {t("create")}
      </Link>
    </Button>
  ) : null;

  const empty = {
    published: [t("list.emptyPublished"), t("list.emptyPublishedBody")],
    draft: [t("list.emptyDraft"), t("list.emptyDraftBody")],
    archived: [t("list.emptyArchived"), t("list.emptyArchivedBody")],
  }[status];

  return (
    <PageContainer>
      <PageHeader title={t("title")} actions={total > 0 ? createButton : null} />
      {total > 0 ? (
        <nav aria-label={t("title")} className="mt-5 flex gap-5 border-b border-line">
          {tabs.map((tab) => (
            <Link
              key={tab}
              href={tab === "published" ? "/jobs" : `/jobs?status=${tab}`}
              aria-current={tab === status ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 text-14 font-medium",
                tab === status
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {t(`tabs.${tab}`)}
              <span className="text-13 font-normal text-ink-muted tabular-nums">{counts[tab]}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-md border border-line bg-paper">
        {list.length === 0 ? (
          ctx.role === "member" ? (
            <EmptyState title={t("list.emptyMember")} description={t("list.emptyMemberBody")} />
          ) : (
            <EmptyState
              title={empty[0]}
              description={empty[1]}
              action={status !== "archived" ? createButton : undefined}
            />
          )
        ) : (
          <ul className="divide-y divide-line">
            {list.map((job) => (
              <li
                key={job.id}
                className="relative flex flex-col gap-1 px-4 py-3 hover:bg-stone sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="text-14 font-medium text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-cobalt"
                  >
                    {job.title}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-13 text-ink-muted">
                    <span>{job.department ?? t("list.noDepartment")}</span>
                    {job.location ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden="true" />
                        {job.location}
                      </span>
                    ) : null}
                    <span>{t(`contract.${job.contract}`)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-13 sm:justify-end">
                  {job.newCount > 0 ? (
                    <Mark className="text-12 font-medium">
                      {t("list.new", { count: job.newCount })}
                    </Mark>
                  ) : null}
                  <span className="text-ink tabular-nums sm:w-28 sm:text-right">
                    {t("list.candidates", { count: job.activeCount })}
                  </span>
                  <span className="whitespace-nowrap text-ink-muted tabular-nums sm:w-40 sm:text-right">
                    {status === "published" && job.publishedAt
                      ? t("list.published", { date: formatRelative(job.publishedAt, locale, now) })
                      : t("list.updated", { date: formatRelative(job.updatedAt, locale, now) })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
