"use client";

import { CalendarDays, Clock, MoreHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  cancelInterviewAction,
  cancelProposalAction,
} from "@/app/(app)/(backoffice)/interviews/actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { cn } from "@/lib/cn";
import { formatDayIn, formatRelative, formatTimeIn } from "@/lib/format";
import type { ApplicationDetail } from "@/lib/services/candidates";

type Scheduling = ApplicationDetail["scheduling"];
type Interview = Scheduling["interviews"][number];

function whereText(
  interview: Pick<Interview, "locationKind" | "location">,
  t: ReturnType<typeof useTranslations<"interviews.locationLine">>,
) {
  const location = interview.location;
  if (interview.locationKind === "video")
    return location ? t("video", { location }) : t("videoNoLink");
  if (interview.locationKind === "onsite")
    return location ? t("onsite", { location }) : t("onsiteNoAddress");
  return location ? t("phone", { location }) : t("phoneNoNumber");
}

/** Interviews and open slot offers of the application, at the top of the panel. */
export function SchedulingSummary({
  scheduling,
  candidateName,
  canManage,
  onChanged,
}: {
  scheduling: Scheduling;
  candidateName: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("interviews.panel");
  const tl = useTranslations("interviews.locationLine");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const zone = scheduling.timeZone;
  const [cancelling, setCancelling] = useState<Interview | null>(null);
  const [pending, start] = useTransition();
  const now = new Date().getTime();
  const shown = scheduling.interviews
    .filter(
      (i) => i.status === "scheduled" || new Date(i.startsAt).getTime() > now - 30 * 86_400_000,
    )
    .slice(0, 4);
  if (shown.length === 0 && scheduling.proposals.length === 0) return null;

  const when = (i: Interview) =>
    `${formatDayIn(i.startsAt, locale, zone)}, ${formatTimeIn(i.startsAt, locale, zone)} – ${formatTimeIn(i.endsAt, locale, zone)}`;

  return (
    <section aria-label={t("title")} className="mb-5 flex flex-col gap-2">
      {scheduling.proposals.map((proposal) => (
        <div
          key={proposal.id}
          className="flex flex-wrap items-start gap-3 rounded-sm border border-line bg-paper px-3 py-2.5"
        >
          <Clock className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-14 font-medium">
              {t("proposal", { date: formatRelative(proposal.createdAt, locale) })}
            </p>
            <p className="text-13 text-ink-muted tabular-nums">
              {t("proposalBody", { count: proposal.slotCount, name: candidateName })}
            </p>
          </div>
          {canManage ? (
            <div className="flex shrink-0 items-center gap-1">
              {proposal.url ? (
                <CopyButton
                  value={proposal.url}
                  label={t("copyLink")}
                  copiedLabel={tx("common.copied")}
                  size="sm"
                />
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await cancelProposalAction(proposal.id);
                    if (!result.ok)
                      return void toast({ message: tx(result.error), tone: "danger" });
                    toast(t("proposalCancelled"));
                    onChanged();
                  })
                }
              >
                {t("cancelProposal")}
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {shown.map((interview) => {
        const upcoming =
          interview.status === "scheduled" && new Date(interview.endsAt).getTime() > now;
        const label =
          interview.status === "cancelled" ? t("cancelled") : upcoming ? t("upcoming") : t("past");
        return (
          <div
            key={interview.id}
            className={cn(
              "flex items-start gap-3 rounded-sm border border-line px-3 py-2.5",
              upcoming ? "bg-paper" : "bg-stone",
            )}
          >
            <CalendarDays
              className={cn("mt-0.5 size-4 shrink-0", upcoming ? "text-cobalt" : "text-ink-muted")}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-13 text-ink-muted">{label}</p>
              <p
                className={cn(
                  "text-14 font-medium tabular-nums first-letter:uppercase",
                  interview.status === "cancelled" && "text-ink-muted line-through",
                )}
              >
                {when(interview)}
              </p>
              <p className="text-13 text-ink-muted">
                {whereText(interview, tl)}
                {interview.attendees.length > 0 ? (
                  <> {t("with", { names: interview.attendees.map((a) => a.name).join(", ") })}</>
                ) : null}
              </p>
              {upcoming && interview.locationKind === "video" && interview.location ? (
                <a
                  href={interview.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-13 font-medium text-cobalt hover:underline"
                >
                  {t("join")}
                </a>
              ) : null}
            </div>
            {upcoming && canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-8 shrink-0 px-0"
                    aria-label={tx("common.more")}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem tone="danger" onSelect={() => setCancelling(interview)}>
                    {t("cancel")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        );
      })}

      <Dialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        {cancelling ? (
          <DialogContent
            width="sm"
            title={t("cancelTitle", {
              date: `${formatDayIn(cancelling.startsAt, locale, zone)}, ${formatTimeIn(cancelling.startsAt, locale, zone)}`,
            })}
            closeLabel={tx("common.close")}
          >
            <DialogBody>
              <p className="text-14">{t("cancelBody", { name: candidateName })}</p>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{tx("common.cancel")}</Button>
              </DialogClose>
              <Button
                variant="danger"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const result = await cancelInterviewAction(cancelling.id);
                    if (!result.ok)
                      return void toast({ message: tx(result.error), tone: "danger" });
                    toast(t("cancelled_toast"));
                    setCancelling(null);
                    onChanged();
                  })
                }
              >
                {t("cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}
