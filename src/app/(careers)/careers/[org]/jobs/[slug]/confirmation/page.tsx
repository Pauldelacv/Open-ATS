import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BrandBar, CareersContainer, CareersFooter } from "@/components/careers/chrome";
import { getCareerOrganization } from "@/lib/careers";
import { getPublishedJob } from "@/lib/services/jobs";

export const metadata: Metadata = { robots: { index: false } };

export default async function ConfirmationPage({
  params,
}: PageProps<"/careers/[org]/jobs/[slug]/confirmation">) {
  const { org: orgSlug, slug } = await params;
  const org = await getCareerOrganization(orgSlug);
  if (!org) notFound();
  const job = await getPublishedJob(org.id, slug);
  const t = await getTranslations({ locale: org.locale, namespace: "careers.confirmation" });
  return (
    <>
      <BrandBar org={org} />
      <main className="flex-1">
        <CareersContainer className="pt-10 md:pt-20">
          <div className="max-w-[560px]">
            <CircleCheck className="size-8 text-success" aria-hidden="true" />
            <h1 className="mt-4 font-heading text-32 text-ink md:text-48">{t("title")}</h1>
            <p className="mt-4 text-16 text-ink">
              {t("body", { job: job?.title ?? slug, company: org.name })}
            </p>
            {org.sendConfirmationEmail ? (
              <p className="mt-2 text-16 text-ink-muted">{t("email")}</p>
            ) : null}
            <Link
              href={`/careers/${org.slug}`}
              className="mt-8 inline-flex h-10 items-center rounded-sm border border-line-strong px-4 text-16 font-medium text-ink hover:bg-stone"
            >
              {t("others")}
            </Link>
          </div>
        </CareersContainer>
      </main>
      <CareersFooter org={org} />
    </>
  );
}
