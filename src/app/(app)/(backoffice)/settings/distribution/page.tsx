import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChannelsManager } from "@/components/settings/channels-manager";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { feedUrl, listChannels } from "@/lib/services/distribution";
import { getOrganization } from "@/lib/services/organizations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.distribution");
  return { title: t("title") };
}

export default async function DistributionSettingsPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "job:manage")) redirect("/settings/profile");
  const [org, channels] = await Promise.all([getOrganization(ctx), listChannels(ctx)]);
  return (
    <ChannelsManager
      channels={channels.map((c) => ({ ...c, feedUrl: feedUrl(org.slug, c.slug) }))}
      feedUrl={feedUrl(org.slug)}
    />
  );
}
