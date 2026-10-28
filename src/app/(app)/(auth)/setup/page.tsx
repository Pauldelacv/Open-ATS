import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthPanel } from "@/components/app/auth-panel";
import { Banner } from "@/components/ui/banner";
import { getMemberships, getSession } from "@/lib/context";
import { canCreateOrganization } from "@/lib/services/organizations";
import { SetupForm } from "./setup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.setup");
  return { title: t("title") };
}

export default async function SetupPage() {
  const t = await getTranslations("auth");
  const session = await getSession();
  if (session && (await getMemberships(session.user.id)).length > 0) redirect("/jobs");
  const open = await canCreateOrganization();
  const locale = await getLocale();

  if (!open) {
    return (
      <AuthPanel title={session ? t("noOrganization.title") : t("setup.title")}>
        <Banner>{session ? t("noOrganization.body") : t("setup.closed")}</Banner>
        {!session ? (
          <Link href="/login" className="mt-4 inline-flex text-14 font-medium text-cobalt hover:underline">
            {t("setup.login")}
          </Link>
        ) : null}
      </AuthPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AuthPanel
        title={session ? t("setup.orgTitle") : t("setup.title")}
        subtitle={session ? t("setup.orgSubtitle") : t("setup.subtitle")}
      >
        <SetupForm accountExists={Boolean(session)} defaultLocale={locale} />
      </AuthPanel>
      {!session ? (
        <p className="px-1 text-13 text-ink-muted">
          {t("setup.hasAccount")}{" "}
          <Link href="/login" className="font-medium text-cobalt hover:underline">
            {t("setup.login")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
