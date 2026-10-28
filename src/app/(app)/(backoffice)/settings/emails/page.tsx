import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmailSettings } from "@/components/settings/email-settings";
import { requireContext } from "@/lib/context";
import { env, smtpConfigured } from "@/lib/env";
import { can } from "@/lib/permissions";
import { listEmailJournal, listTemplates } from "@/lib/services/emails";
import { getOrganization } from "@/lib/services/organizations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.emails");
  return { title: t("title") };
}

export default async function EmailSettingsPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "templates:manage")) redirect("/settings/profile");
  const [templates, journal, org] = await Promise.all([
    listTemplates(ctx),
    listEmailJournal(ctx),
    getOrganization(ctx),
  ]);
  return (
    <EmailSettings
      templates={templates}
      journal={journal}
      smtp={{ configured: smtpConfigured(), from: env().MAIL_FROM }}
      companyName={org.name}
      recruiterName={ctx.user.name}
    />
  );
}
