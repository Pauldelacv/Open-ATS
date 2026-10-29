"use client";

import { CalendarPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { loose } from "@/i18n/loose";
import { cn } from "@/lib/cn";
import { formatDayIn, formatTimeIn } from "@/lib/format";
import { zonedDate } from "@/lib/time/zoned";

type Proposal = {
  status: "open" | "booked" | "closed";
  jobTitle: string;
  company: string;
  durationMinutes: number;
  where: string;
  videoUrl: string | null;
  timeZone: string;
  interview: { startsAt: string; endsAt: string; canChange: boolean } | null;
  available: Array<{ start: string; end: string }>;
};

/** « UTC+1 » for the zone at a given moment. */
function offsetLabel(date: Date, timeZone: string) {
  const part = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  return (part ?? "GMT").replace("GMT", "UTC");
}

export function SlotPicker({
  orgSlug,
  token,
  proposal,
}: {
  orgSlug: string;
  token: string;
  proposal: Proposal;
}) {
  const t = useTranslations("interviews.public");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const router = useRouter();
  const zone = proposal.timeZone;
  const [changing, setChanging] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const city = zone.split("/").pop()!.replace(/_/g, " ");

  const days = useMemo(() => {
    const groups = new Map<string, Array<{ start: string; end: string }>>();
    for (const slot of proposal.available) {
      if (proposal.interview && slot.start === proposal.interview.startsAt) continue;
      const day = zonedDate(new Date(slot.start), zone);
      groups.set(day, [...(groups.get(day) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [proposal, zone]);

  const label = (start: string) =>
    `${formatDayIn(start, locale, zone)}, ${formatTimeIn(start, locale, zone)}`;

  const confirm = async () => {
    if (!chosen) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/careers/${orgSlug}/interview/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: chosen }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "server");
        setPending(false);
        if (data.error === "taken") router.refresh();
        return;
      }
      setChanging(false);
      setChosen(null);
      setPending(false);
      router.refresh();
    } catch {
      setError("server");
      setPending(false);
    }
  };

  if (proposal.status === "closed")
    return (
      <>
        <h1 className="font-heading text-32 text-ink md:text-48">{t("closedTitle")}</h1>
        <p className="mt-4 text-16 text-ink-muted">{t("closedBody")}</p>
      </>
    );

  if (proposal.status === "booked" && proposal.interview && !changing) {
    const i = proposal.interview;
    return (
      <>
        <h1 className="font-heading text-32 text-ink md:text-48">{t("bookedTitle")}</h1>
        <p className="mt-4 text-16 text-ink-muted">{t("bookedBody")}</p>
        <dl className="mt-6 flex flex-col gap-3 border-y border-line py-5">
          <div>
            <dt className="text-13 text-ink-muted">{proposal.jobTitle}</dt>
            <dd className="text-20 font-semibold text-ink tabular-nums first-letter:uppercase">
              {formatDayIn(i.startsAt, locale, zone)}, {formatTimeIn(i.startsAt, locale, zone)} –{" "}
              {formatTimeIn(i.endsAt, locale, zone)}
            </dd>
            <dd className="text-14 text-ink-muted">
              {t("zone", { city, offset: offsetLabel(new Date(i.startsAt), zone) })}
            </dd>
          </div>
          <div>
            <dd className="text-16 text-ink">{proposal.where}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="brand" size="lg">
            <a href={`/careers/${orgSlug}/interview/${token}/invite.ics`}>
              <CalendarPlus aria-hidden="true" />
              {t("addToCalendar")}
            </a>
          </Button>
          {i.canChange && days.length > 0 ? (
            <Button size="lg" onClick={() => setChanging(true)}>
              {t("change")}
            </Button>
          ) : null}
        </div>
        {i.canChange ? <p className="mt-3 text-14 text-ink-muted">{t("changeHint")}</p> : null}
      </>
    );
  }

  return (
    <>
      <h1 className="font-heading text-32 text-ink md:text-48">{t("title")}</h1>
      <p className="mt-4 text-16 text-ink">
        {t("intro", {
          job: proposal.jobTitle,
          company: proposal.company,
          minutes: proposal.durationMinutes,
        })}
      </p>
      <p className="mt-1 text-16 text-ink-muted">{proposal.where}</p>
      {days.length > 0 ? (
        <p className="mt-1 text-14 text-ink-muted">
          {t("zone", { city, offset: offsetLabel(new Date(days[0]![1][0]!.start), zone) })}
        </p>
      ) : null}

      {error ? (
        <Banner tone="danger" className="mt-6">
          {tx(`interviews.public.errors.${error}`)}
        </Banner>
      ) : null}

      {days.length === 0 ? (
        <p className="mt-8 border-y border-line py-6 text-16 text-ink">{t("noneLeft")}</p>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          {days.map(([day, slots]) => (
            <section key={day} aria-labelledby={`day-${day}`}>
              <h2
                id={`day-${day}`}
                className="text-16 font-semibold text-ink first-letter:uppercase"
              >
                {formatDayIn(slots[0]!.start, locale, zone)}
              </h2>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {slots.map((slot) => {
                  const on = chosen === slot.start;
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      aria-pressed={on}
                      aria-label={t("pick", { slot: label(slot.start) })}
                      onClick={() => setChosen(on ? null : slot.start)}
                      className={cn(
                        "h-11 rounded-sm border text-16 font-medium tabular-nums transition-colors duration-[120ms]",
                        on
                          ? "border-brand bg-brand text-brand-fg"
                          : "border-line-strong bg-paper text-ink hover:bg-stone",
                      )}
                    >
                      {formatTimeIn(slot.start, locale, zone)}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {changing ? (
            <div>
              <Button variant="ghost" onClick={() => setChanging(false)}>
                {t("keep")}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {chosen ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper px-4 py-3 shadow-float">
          <div className="mx-auto flex max-w-[680px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-16 font-medium text-ink tabular-nums first-letter:uppercase">
              {t("chosen", { slot: label(chosen) })}
            </p>
            <Button variant="brand" size="lg" loading={pending} onClick={confirm}>
              {pending ? t("confirming") : t("confirm")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
