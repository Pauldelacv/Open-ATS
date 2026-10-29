import { getLocale, getTranslations } from "next-intl/server";
import { BackToOpenings } from "@/components/careers/back-to-openings";

export default async function CareersNotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "careers.job" });
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pt-16 md:px-8">
      <div className="max-w-[560px]">
        <h1 className="font-heading text-32 text-ink md:text-48">{t("closed")}</h1>
        <p className="mt-3 text-16 text-ink-muted">{t("closedBody")}</p>
        <BackToOpenings label={t("seeOthers")} />
      </div>
    </main>
  );
}
