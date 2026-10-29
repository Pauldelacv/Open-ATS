import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PrivacySettings } from "@/components/settings/privacy-settings";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { retentionOverview } from "@/lib/services/gdpr";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.privacy");
  return { title: t("title") };
}

export default async function PrivacySettingsPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:privacy")) redirect("/settings/profile");
  const overview = await retentionOverview(ctx);
  return (
    <PrivacySettings
      months={overview.months}
      contact={overview.contact ?? ""}
      due={overview.due}
      upcoming={overview.upcoming}
      anonymized={overview.anonymized}
    />
  );
}
