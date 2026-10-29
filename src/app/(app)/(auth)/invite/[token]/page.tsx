import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthPanel } from "@/components/app/auth-panel";
import { Banner } from "@/components/ui/banner";
import { getSession } from "@/lib/context";
import { findInvitation } from "@/lib/services/team";
import { AcceptInvitation, InviteSignupForm, SignOutButton } from "./invite-forms";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const t = await getTranslations("auth");
  const tr = await getTranslations("roles");
  const invitation = await findInvitation(token);

  if (!invitation || !invitation.valid) {
    return (
      <AuthPanel title="Invitation">
        <Banner tone="warning">{t("invite.invalid")}</Banner>
      </AuthPanel>
    );
  }

  const title = t("invite.title", { organization: invitation.organizationName });
  const subtitle = t("invite.subtitle", { role: tr(`${invitation.role}Article`) });
  const session = await getSession();

  if (session) {
    if (session.user.email.toLowerCase() !== invitation.email) {
      return (
        <AuthPanel title={title}>
          <Banner tone="warning">{t("invite.mismatch", { email: invitation.email })}</Banner>
          <SignOutButton label={t("invite.signOut")} next={`/invite/${token}`} />
        </AuthPanel>
      );
    }
    return (
      <AuthPanel title={title} subtitle={subtitle}>
        <AcceptInvitation token={token} />
      </AuthPanel>
    );
  }

  if (invitation.hasAccount) {
    return (
      <AuthPanel title={title} subtitle={subtitle}>
        <p className="text-14">{t("invite.loginFirst", { email: invitation.email })}</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(invitation.email)}`}
          className="mt-4 inline-flex h-8 items-center rounded-sm bg-cobalt px-3 text-14 font-medium text-paper hover:bg-cobalt-hover"
        >
          {t("invite.login")}
        </Link>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel title={title} subtitle={subtitle}>
      <InviteSignupForm token={token} email={invitation.email} />
    </AuthPanel>
  );
}
