import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TeamManager } from "@/components/settings/team-manager";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { listMembers, listPendingInvitations } from "@/lib/services/team";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.team");
  return { title: t("title") };
}

export default async function TeamSettingsPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "settings:team")) redirect("/settings/profile");
  const [members, invitations] = await Promise.all([listMembers(ctx), listPendingInvitations(ctx)]);
  return <TeamManager members={members} invitations={invitations} currentUserId={ctx.userId} />;
}
