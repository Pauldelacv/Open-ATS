import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OrganizationForm } from "@/components/settings/organization-form";
import { requireContext } from "@/lib/context";
import { env } from "@/lib/env";
import { mediaUrl } from "@/lib/media";
import { can } from "@/lib/permissions";
import { getOrganization } from "@/lib/services/organizations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.organization");
  return { title: t("title") };
}

export default async function OrganizationSettingsPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:organization")) redirect("/settings/profile");
  const org = await getOrganization(ctx);
  return (
    <OrganizationForm
      appUrl={env().APP_URL}
      logoUrl={org.logoKey ? mediaUrl(org.logoKey) : null}
      coverUrl={org.coverKey ? mediaUrl(org.coverKey) : null}
      initial={{
        name: org.name,
        slug: org.slug,
        websiteUrl: org.websiteUrl ?? "",
        locale: org.locale,
        brandColor: org.brandColor.toUpperCase(),
        headingFont: org.headingFont,
        tagline: org.tagline ?? "",
        descriptionHtml: org.descriptionHtml,
        sendConfirmationEmail: org.sendConfirmationEmail,
      }}
    />
  );
}
