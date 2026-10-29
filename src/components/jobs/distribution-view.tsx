"use client";

import { ExternalLink, Mail } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setJobInFeedsAction } from "@/app/(app)/(backoffice)/jobs/[jobId]/distribution/actions";
import { SettingsSection } from "@/components/settings/section";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import type { JobDistribution } from "@/lib/services/distribution";

function LinkRow({
  name,
  hint,
  url,
  count,
}: {
  name: string;
  hint?: string;
  url?: string;
  count: number;
}) {
  const t = useTranslations("distribution");
  const tc = useTranslations("common");
  return (
    <li className="grid gap-x-4 gap-y-1.5 py-3 md:grid-cols-[180px_minmax(0,1fr)_auto_128px] md:items-center">
      <span className="min-w-0">
        <span className="block truncate text-14 font-medium text-ink">{name}</span>
        {hint ? <span className="block text-12 text-ink-muted">{hint}</span> : null}
      </span>
      {/* The end of the link is what tells channels apart, so it never gets cut. */}
      <span className="flex min-w-0 text-13 text-ink-muted" title={url}>
        {url ? (
          <>
            <span className="truncate">{url.split("?")[0]}</span>
            {url.includes("?") ? <span className="shrink-0">?{url.split("?")[1]}</span> : null}
          </>
        ) : null}
      </span>
      <span className="flex md:justify-end">
        {url ? (
          <CopyButton value={url} label={tc("copyLink")} copiedLabel={tc("copied")} size="sm" />
        ) : null}
      </span>
      <span className="text-13 text-ink-muted tabular-nums md:text-right">
        {t("applications", { count })}
      </span>
    </li>
  );
}

export function DistributionView({
  distribution,
  jobTitle,
  canManageChannels,
}: {
  distribution: JobDistribution;
  jobTitle: string;
  canManageChannels: boolean;
}) {
  const t = useTranslations("distribution");
  const tx = loose(useTranslations());
  const [inFeeds, setInFeeds] = useState(distribution.job.inFeeds);
  const [pending, start] = useTransition();
  const linkedin = distribution.channels.find((c) => c.slug === "linkedin");
  const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    linkedin?.url ?? distribution.directUrl,
  )}`;
  const mailto = `mailto:?subject=${encodeURIComponent(jobTitle)}&body=${encodeURIComponent(
    distribution.ad,
  )}`;

  const toggleFeeds = (value: boolean) => {
    setInFeeds(value);
    start(async () => {
      const result = await setJobInFeedsAction(distribution.job.id, value);
      if (!result.ok) {
        setInFeeds(!value);
        toast({ message: tx(result.error), tone: "danger" });
        return;
      }
      toast(value ? t("inFeedsOn") : t("inFeedsOff"));
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {distribution.job.status !== "published" ? (
        <Banner tone="warning" title={t("notPublished")}>
          {t("notPublishedBody")}
        </Banner>
      ) : null}

      <SettingsSection title={t("links")} description={t("linksDescription")}>
        <ul className="-my-3 divide-y divide-line">
          <LinkRow
            name={t("direct")}
            hint={t("directHint")}
            url={distribution.directUrl}
            count={distribution.direct}
          />
          {distribution.channels.map((channel) => (
            <LinkRow
              key={channel.id}
              name={channel.name}
              url={channel.url}
              count={channel.applications}
            />
          ))}
          {distribution.removedChannels.map((channel) => (
            <LinkRow
              key={channel.name}
              name={t("removed", { name: channel.name })}
              count={channel.applications}
            />
          ))}
          {distribution.manual > 0 ? (
            <LinkRow name={t("manual")} count={distribution.manual} />
          ) : null}
        </ul>
        {canManageChannels ? (
          <p className="border-t border-line pt-3 text-13">
            <Link href="/settings/distribution" className="font-medium text-cobalt hover:underline">
              {t("manageChannels")}
            </Link>
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection title={t("ad")} description={t("adDescription")}>
        <Textarea
          readOnly
          value={distribution.ad}
          rows={12}
          aria-label={t("ad")}
          className="text-14 leading-6"
        />
        <div className="flex flex-wrap gap-2">
          <CopyButton
            value={distribution.ad}
            label={t("copyText")}
            copiedLabel={tx("common.textCopied")}
          />
          <Button asChild>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" />
              {t("shareLinkedIn")}
            </a>
          </Button>
          <Button asChild>
            <a href={mailto}>
              <Mail aria-hidden="true" />
              {t("shareEmail")}
            </a>
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t("feeds")} description={t("feedsDescription")}>
        <Switch
          checked={inFeeds}
          disabled={pending}
          onCheckedChange={toggleFeeds}
          label={t("inFeeds")}
        />
        {canManageChannels ? (
          <p className="text-13">
            <Link href="/settings/distribution" className="font-medium text-cobalt hover:underline">
              {t("feedSettings")}
            </Link>
          </p>
        ) : null}
      </SettingsSection>
    </div>
  );
}
