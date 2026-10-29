import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApplyForm } from "@/components/careers/apply-form";
import { BrandBar, CareersContainer, CareersFooter } from "@/components/careers/chrome";
import { StickyApply } from "@/components/careers/sticky-apply";
import { getCareerOrganization, trackedSource } from "@/lib/careers";
import { appUrl } from "@/lib/env";
import { formatDate, formatSalary } from "@/lib/format";
import { richTextToPlain } from "@/lib/sanitize";
import { getPublishedJob } from "@/lib/services/jobs";
import { jobPostingLd, ldScript } from "@/lib/structured-data";

async function load(params: PageProps<"/careers/[org]/jobs/[slug]">["params"]) {
  const { org: orgSlug, slug } = await params;
  const org = await getCareerOrganization(orgSlug);
  if (!org) return null;
  const job = await getPublishedJob(org.id, slug);
  return job ? { org, job } : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/careers/[org]/jobs/[slug]">): Promise<Metadata> {
  const data = await load(params);
  if (!data) return {};
  const { org, job } = data;
  const url = appUrl(`/careers/${org.slug}/jobs/${job.slug}`);
  const description = (richTextToPlain(job.descriptionHtml) || job.title)
    .replace(/\s+/g, " ")
    .slice(0, 180);
  return {
    title: job.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: `${job.title} – ${org.name}`,
      description,
      siteName: org.name,
      images: org.coverUrl ? [{ url: appUrl(org.coverUrl) }] : undefined,
    },
  };
}

export default async function CareerJobPage({
  params,
  searchParams,
}: PageProps<"/careers/[org]/jobs/[slug]">) {
  const data = await load(params);
  const source = trackedSource((await searchParams).src);
  if (!data) notFound();
  const { org, job } = data;
  const t = await getTranslations({ locale: org.locale, namespace: "careers" });
  const tj = await getTranslations({ locale: org.locale, namespace: "jobs" });
  const salary = formatSalary(job, org.locale, {
    period: tj(`salaryPeriod.${job.salaryPeriod}`),
    from: t("job.salaryFrom"),
    upTo: t("job.salaryUpTo"),
  });
  const url = appUrl(`/careers/${org.slug}/jobs/${job.slug}`);

  const details: Array<[string, string]> = [
    [t("job.contract"), tj(`contract.${job.contract}`)],
    ...(job.location ? ([[t("job.location"), job.location]] as Array<[string, string]>) : []),
    [t("job.remote"), tj(`remote.${job.remote}`)],
    ...(job.department ? ([[t("job.department"), job.department]] as Array<[string, string]>) : []),
    ...(salary ? ([[t("job.salary"), salary]] as Array<[string, string]>) : []),
    ...(job.publishedAt
      ? ([[t("job.published"), formatDate(job.publishedAt, org.locale)]] as Array<[string, string]>)
      : []),
  ];

  return (
    <>
      <BrandBar org={org} />
      <main className="flex-1 pb-24 lg:pb-0">
        <CareersContainer className="pt-5 md:pt-10">
          <Link
            href={`/careers/${org.slug}${source ? `?src=${source}` : ""}`}
            className="inline-flex items-center gap-1 rounded-sm text-14 text-ink-muted hover:text-ink"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {t("job.back")}
          </Link>
          <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,680px)_300px] lg:justify-between">
            <article>
              <h1 className="font-heading text-32 text-ink md:text-48">{job.title}</h1>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-4 sm:grid-cols-3 lg:hidden">
                {details.map(([term, value]) => (
                  <div key={term}>
                    <dt className="text-13 text-ink-muted">{term}</dt>
                    <dd className="text-14 font-medium text-ink tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              {job.descriptionHtml ? (
                <div
                  className="rich-text mt-8"
                  dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
                />
              ) : null}

              <section
                id="apply"
                aria-labelledby="apply-title"
                className="mt-12 scroll-mt-6 border-t border-line pt-8"
              >
                <h2 id="apply-title" className="font-heading text-32 text-ink">
                  {t("apply.title")}
                </h2>
                <div className="mt-4">
                  <ApplyForm
                    orgSlug={org.slug}
                    jobSlug={job.slug}
                    company={org.name}
                    retentionMonths={org.retentionMonths}
                    locale={org.locale}
                    source={source}
                    questions={job.questions.map((q) => ({
                      id: q.id,
                      label: q.label,
                      type: q.type,
                      options: q.options,
                      required: q.required,
                    }))}
                  />
                </div>
              </section>
            </article>

            <aside className="hidden lg:block">
              <div className="sticky top-8 rounded-md border border-line p-5">
                <h2 className="text-16 font-semibold">{t("job.details")}</h2>
                <dl className="mt-3 flex flex-col gap-3">
                  {details.map(([term, value]) => (
                    <div key={term}>
                      <dt className="text-13 text-ink-muted">{term}</dt>
                      <dd className="text-14 font-medium text-ink tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <a
                  href="#apply"
                  className="mt-5 flex h-10 items-center justify-center rounded-sm bg-brand px-4 text-16 font-medium text-brand-fg hover:bg-brand-hover"
                >
                  {t("job.applyToJob")}
                </a>
              </div>
            </aside>
          </div>
        </CareersContainer>
      </main>
      <CareersFooter org={org} />
      <StickyApply label={t("job.applyToJob")} targetId="apply" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldScript(
            jobPostingLd({
              ...job,
              url,
              organization: {
                name: org.name,
                websiteUrl: org.websiteUrl,
                logoUrl: org.logoUrl ? appUrl(org.logoUrl) : null,
              },
            }),
          ),
        }}
      />
    </>
  );
}
