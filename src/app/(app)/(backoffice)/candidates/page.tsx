import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { PoolFilters } from "@/components/pool/pool-filters";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Highlighted } from "@/components/ui/mark";
import { requireContext } from "@/lib/context";
import { formatRelative } from "@/lib/format";
import { isUuid } from "@/lib/services/access";
import { listJobs } from "@/lib/services/jobs";
import { searchPool, type PoolStatus } from "@/lib/services/search";
import { listTags } from "@/lib/services/tags";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pool");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function PoolPage({ searchParams }: PageProps<"/candidates">) {
  const ctx = await requireContext();
  const t = await getTranslations("pool");
  const locale = await getLocale();
  const params = await searchParams;
  const q = str(params.q)?.slice(0, 200) ?? "";
  const tagId = str(params.tag);
  const jobId = str(params.job);
  const status = str(params.status);
  const page = Number(str(params.page) ?? 1) || 1;
  const filters = {
    q,
    tagId: tagId && isUuid(tagId) ? tagId : undefined,
    jobId: jobId && isUuid(jobId) ? jobId : undefined,
    status:
      status === "active" || status === "hired" || status === "rejected"
        ? (status as PoolStatus)
        : undefined,
    page,
  };
  const [result, tagList, jobList] = await Promise.all([
    searchPool(ctx, filters),
    listTags(ctx),
    listJobs(ctx),
  ]);
  const filtered = Boolean(q || filters.tagId || filters.jobId || filters.status);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const now = new Date();
  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({
      q,
      tag: filters.tagId,
      job: filters.jobId,
      status: filters.status,
    }))
      if (v) next.set(k, v);
    if (p > 1) next.set("page", String(p));
    return `/candidates${next.size ? `?${next}` : ""}`;
  };

  return (
    <PageContainer>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mt-5">
        <Suspense>
          <PoolFilters
            tags={tagList.map((x) => ({ id: x.id, name: x.name }))}
            jobs={jobList.map((j) => ({ id: j.id, title: j.title }))}
          />
        </Suspense>
      </div>
      <p className="mt-4 mb-2 text-13 text-ink-muted tabular-nums" aria-live="polite">
        {t("results", { count: result.total })}
      </p>
      <div className="overflow-hidden rounded-md border border-line bg-paper">
        {result.rows.length === 0 ? (
          filtered ? (
            <EmptyState
              title={q ? t("noResults", { query: q }) : t("noResultsFilters")}
              description={t("noResultsBody")}
              action={
                <Link
                  href="/candidates"
                  className="inline-flex h-8 items-center rounded-sm border border-line-strong bg-paper px-3 text-14 font-medium hover:bg-stone"
                >
                  {t("clear")}
                </Link>
              }
            />
          ) : (
            <EmptyState title={t("empty")} description={t("emptyBody")} />
          )
        ) : (
          <ul className="divide-y divide-line">
            {result.rows.map((row) => {
              const name = `${row.firstName} ${row.lastName}`;
              return (
                <li key={row.id} className="relative px-4 py-3 hover:bg-stone">
                  <div className="flex flex-col gap-1 md:flex-row md:items-start md:gap-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/candidates/${row.id}`}
                        className="text-14 font-medium text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-cobalt"
                      >
                        <Highlighted text={name} ranges={row.nameHighlights} />
                      </Link>
                      <p className="truncate text-13 text-ink-muted">{row.email}</p>
                      {row.match ? (
                        <p className="mt-1.5 text-13 text-ink">
                          <span className="mr-2 text-12 text-ink-muted">
                            {row.match.field === "cv" ? t("inCv") : t("inNote")}
                          </span>
                          <Highlighted
                            text={row.match.snippet.text}
                            ranges={row.match.snippet.highlights}
                          />
                        </p>
                      ) : null}
                      {row.tags.length > 0 ? (
                        <p className="mt-1.5 flex flex-wrap gap-1">
                          {row.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex h-5 items-center rounded-sm border border-line bg-paper px-1.5 text-12"
                            >
                              {tag}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1 text-13 md:w-80 md:shrink-0 md:items-end md:text-right">
                      {row.latest ? (
                        <span className="flex max-w-full items-center gap-2">
                          <span className="truncate text-ink">{row.latest.jobTitle}</span>
                          <Badge
                            tone={
                              row.latest.stageKind === "rejected"
                                ? "danger"
                                : row.latest.stageKind === "hired"
                                  ? "success"
                                  : "neutral"
                            }
                          >
                            {row.latest.stageName}
                          </Badge>
                        </span>
                      ) : null}
                      <span className="flex gap-3 text-ink-muted tabular-nums">
                        {row.applicationCount > 1 ? (
                          <span>{t("applications", { count: row.applicationCount })}</span>
                        ) : null}
                        <span>{formatRelative(row.lastActivityAt, locale, now)}</span>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {pages > 1 ? (
        <nav
          className="mt-4 flex items-center justify-between text-13"
          aria-label={t("page", { page, total: pages })}
        >
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="rounded-sm px-2 py-1 font-medium text-cobalt hover:underline"
            >
              {t("previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-muted tabular-nums">{t("page", { page, total: pages })}</span>
          {page < pages ? (
            <Link
              href={pageHref(page + 1)}
              className="rounded-sm px-2 py-1 font-medium text-cobalt hover:underline"
            >
              {t("next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </PageContainer>
  );
}
