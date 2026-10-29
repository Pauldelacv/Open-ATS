import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrandBar, CareersContainer, CareersFooter } from "@/components/careers/chrome";
import { CareersJobList } from "@/components/careers/job-list";
import { getCareerOrganization, trackedSource } from "@/lib/careers";
import { appUrl } from "@/lib/env";
import { richTextToPlain } from "@/lib/sanitize";
import { listPublishedJobs } from "@/lib/services/jobs";

export async function generateMetadata({ params }: PageProps<"/careers/[org]">): Promise<Metadata> {
  const { org: slug } = await params;
  const org = await getCareerOrganization(slug);
  if (!org) return {};
  const t = await getTranslations({ locale: org.locale, namespace: "careers" });
  const title = org.tagline || t("heading", { company: org.name });
  const description = (richTextToPlain(org.descriptionHtml) || title).slice(0, 180);
  const url = appUrl(`/careers/${org.slug}`);
  return {
    title: { absolute: `${title} – ${org.name}` },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: org.name,
      locale: org.locale === "fr" ? "fr_FR" : "en_GB",
      images: org.coverUrl ? [{ url: appUrl(org.coverUrl) }] : undefined,
    },
  };
}

export default async function CareersHome({ params, searchParams }: PageProps<"/careers/[org]">) {
  const { org: slug } = await params;
  const source = trackedSource((await searchParams).src);
  const org = (await getCareerOrganization(slug))!;
  const t = await getTranslations({ locale: org.locale, namespace: "careers" });
  const jobs = await listPublishedJobs(org.id);
  const heading = org.tagline || t("heading", { company: org.name });
  const hasAbout = Boolean(org.descriptionHtml || org.coverUrl);

  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: org.name,
    url: org.websiteUrl ?? appUrl(`/careers/${org.slug}`),
    logo: org.logoUrl ? appUrl(org.logoUrl) : undefined,
  };

  return (
    <>
      <BrandBar org={org} />
      <main className="flex-1">
        <CareersContainer className="pt-6 md:pt-12">
          <div
            className={hasAbout ? "grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16" : ""}
          >
            <section aria-labelledby="openings">
              <h1 className="font-heading text-32 text-ink md:text-48">{heading}</h1>
              <p
                id="openings"
                className="mt-2 mb-5 text-16 text-ink-muted tabular-nums md:mt-3 md:mb-8"
              >
                {t("openings", { count: jobs.length })}
              </p>
              {jobs.length === 0 ? (
                <div className="border-y border-line py-10">
                  <p className="text-16 text-ink">{t("empty")}</p>
                  <p className="mt-1 text-14 text-ink-muted">{t("emptyBody")}</p>
                </div>
              ) : (
                <CareersJobList orgSlug={org.slug} jobs={jobs} source={source} />
              )}
            </section>
            {hasAbout ? (
              <aside aria-labelledby="about" className="lg:pt-3">
                {org.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={org.coverUrl}
                    alt=""
                    width={680}
                    height={510}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full rounded-md object-cover"
                  />
                ) : null}
                <h2 id="about" className="mt-6 text-20 font-semibold">
                  {t("about", { company: org.name })}
                </h2>
                {org.descriptionHtml ? (
                  <div
                    className="rich-text mt-3"
                    dangerouslySetInnerHTML={{ __html: org.descriptionHtml }}
                  />
                ) : null}
              </aside>
            ) : null}
          </div>
        </CareersContainer>
      </main>
      <CareersFooter org={org} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationLd).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
