import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandBar, CareersContainer, CareersFooter } from "@/components/careers/chrome";
import { getCareerOrganization } from "@/lib/careers";

export async function generateMetadata({
  params,
}: PageProps<"/careers/[org]/privacy">): Promise<Metadata> {
  const { org: slug } = await params;
  const org = await getCareerOrganization(slug);
  if (!org) return {};
  const t = await getTranslations({ locale: org.locale, namespace: "careers.privacy" });
  return { title: t("title") };
}

export default async function PrivacyPage({ params }: PageProps<"/careers/[org]/privacy">) {
  const { org: slug } = await params;
  const org = (await getCareerOrganization(slug))!;
  const t = await getTranslations({ locale: org.locale, namespace: "careers.privacy" });
  const tc = await getTranslations({ locale: org.locale, namespace: "careers" });
  const sections: Array<[string, string]> = [
    [t("controllerTitle"), t("controller", { company: org.name })],
    [t("dataTitle"), t("data")],
    [t("purposeTitle"), t("purpose")],
    [t("retentionTitle"), t("retention", { months: org.retentionMonths })],
  ];
  return (
    <>
      <BrandBar org={org} />
      <main className="flex-1">
        <CareersContainer className="pt-5 md:pt-10">
          <Link
            href={`/careers/${org.slug}`}
            className="inline-flex items-center gap-1 rounded-sm text-14 text-ink-muted hover:text-ink"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {tc("job.back")}
          </Link>
          <div className="mt-4 max-w-[680px]">
            <h1 className="font-heading text-32 text-ink md:text-48">{t("title")}</h1>
            <p className="mt-4 text-16 text-ink-muted">{t("intro", { company: org.name })}</p>
            {sections.map(([title, body]) => (
              <section key={title} className="mt-8">
                <h2 className="text-20 font-semibold">{title}</h2>
                <p className="mt-2 text-16">{body}</p>
              </section>
            ))}
            <section className="mt-8">
              <h2 className="text-20 font-semibold">{t("rightsTitle")}</h2>
              <p className="mt-2 text-16">{t("rights")}</p>
              <p className="mt-2 text-16">
                {org.privacyContactEmail
                  ? t.rich("contact", {
                      email: org.privacyContactEmail,
                      link: (chunks) => (
                        <a
                          href={`mailto:${org.privacyContactEmail}`}
                          className="text-brand-link underline underline-offset-2"
                        >
                          {chunks}
                        </a>
                      ),
                    })
                  : t("contactFallback")}
              </p>
            </section>
          </div>
        </CareersContainer>
      </main>
      <CareersFooter org={org} />
    </>
  );
}
