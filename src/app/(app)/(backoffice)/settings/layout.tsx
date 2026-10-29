import { getTranslations } from "next-intl/server";
import { PageContainer } from "@/components/app/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const t = await getTranslations("settings");
  const items = [
    ...(can(ctx.role, "settings:organization")
      ? [{ href: "/settings/organization", label: t("nav.organization") }]
      : []),
    ...(can(ctx.role, "settings:team") ? [{ href: "/settings/team", label: t("nav.team") }] : []),
    ...(can(ctx.role, "job:manage")
      ? [{ href: "/settings/distribution", label: t("nav.distribution") }]
      : []),
    ...(can(ctx.role, "templates:manage")
      ? [{ href: "/settings/emails", label: t("nav.emails") }]
      : []),
    ...(can(ctx.role, "settings:privacy")
      ? [{ href: "/settings/privacy", label: t("nav.privacy") }]
      : []),
    { href: "/settings/profile", label: t("nav.profile") },
  ];
  return (
    <PageContainer>
      <h1 className="text-24 font-semibold">{t("title")}</h1>
      <div className="mt-5 grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <SettingsNav items={items} label={t("title")} />
        <div className="min-w-0">{children}</div>
      </div>
    </PageContainer>
  );
}
