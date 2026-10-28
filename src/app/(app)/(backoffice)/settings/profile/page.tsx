import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/settings/profile-form";
import { requireContext } from "@/lib/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.profile");
  return { title: t("title") };
}

export default async function ProfilePage() {
  const ctx = await requireContext();
  const locale = (ctx.user as { locale?: string | null }).locale ?? (await getLocale());
  return <ProfileForm name={ctx.user.name} email={ctx.user.email} locale={locale === "en" ? "en" : "fr"} />;
}
