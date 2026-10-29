import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmailSettings } from "@/components/settings/email-settings";
import { requireContext } from "@/lib/context";
import { env, imapConfigured, replyMailbox, smtpConfigured } from "@/lib/env";
import { getMailboxState } from "@/lib/mail/imap";
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
  const [templates, journal, org, mailboxState] = await Promise.all([
    listTemplates(ctx),
    listEmailJournal(ctx),
    getOrganization(ctx),
    imapConfigured() ? getMailboxState() : null,
  ]);
  return (
    <EmailSettings
      templates={templates}
      journal={journal}
      smtp={{ configured: smtpConfigured(), from: env().MAIL_FROM }}
      mailbox={{
        configured: imapConfigured(),
        address: replyMailbox() ?? env().IMAP_USER ?? null,
        lastCheckAt: mailboxState?.lastCheckAt?.toISOString() ?? null,
        lastError: mailboxState?.lastError ?? null,
        imported: mailboxState?.imported ?? 0,
      }}
      companyName={org.name}
      recruiterName={ctx.user.name}
    />
  );
}
