import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarForm } from "@/components/settings/calendar-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { requireContext } from "@/lib/context";
import { getMyCalendar } from "@/lib/services/interviews";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.profile");
  return { title: t("title") };
}

export default async function ProfilePage() {
  const ctx = await requireContext();
  const locale = (ctx.user as { locale?: string | null }).locale ?? (await getLocale());
  const calendar = await getMyCalendar(ctx);
  return (
    <div className="flex flex-col gap-4">
      <ProfileForm
        name={ctx.user.name}
        email={ctx.user.email}
        locale={locale === "en" ? "en" : "fr"}
      />
      <CalendarForm
        calendar={{
          ...calendar,
          busyFetchedAt: calendar.busyFetchedAt?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
