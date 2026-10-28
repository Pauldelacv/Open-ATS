import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CareerOrganization } from "@/lib/careers";

export function CareersContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1120px] px-4 md:px-8 ${className}`}>{children}</div>;
}

export async function BrandBar({ org }: { org: CareerOrganization }) {
  const t = await getTranslations({ locale: org.locale, namespace: "careers" });
  return (
    <header className="border-b border-line">
      <CareersContainer className="flex h-14 items-center justify-between gap-4 md:h-16">
        <Link href={`/careers/${org.slug}`} className="flex min-w-0 items-center gap-2.5 rounded-sm">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" width={32} height={32} className="size-8 shrink-0 rounded-sm object-contain" />
          ) : null}
          <span className="truncate text-16 font-semibold text-ink">{org.name}</span>
        </Link>
        {org.websiteUrl ? (
          <a
            href={org.websiteUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm text-14 text-ink-muted hover:text-ink"
          >
            <span className="hidden sm:inline">{t("website")}</span>
            <ExternalLink className="size-4" aria-hidden="true" />
            <span className="sr-only sm:hidden">{t("website")}</span>
          </a>
        ) : null}
      </CareersContainer>
    </header>
  );
}

export async function CareersFooter({ org }: { org: CareerOrganization }) {
  const t = await getTranslations({ locale: org.locale, namespace: "careers.footer" });
  return (
    <footer className="mt-16 border-t border-line bg-stone">
      <CareersContainer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-6 text-13 text-ink-muted">
        <Link href={`/careers/${org.slug}/privacy`} className="rounded-sm hover:text-ink hover:underline">
          {t("privacy")}
        </Link>
        <a href="https://github.com/Pauldelacv/Open-ATS" target="_blank" rel="noopener" className="rounded-sm hover:text-ink hover:underline">
          {t("poweredBy")}
        </a>
      </CareersContainer>
    </footer>
  );
}
