"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCalendarAction } from "@/app/(app)/(backoffice)/interviews/actions";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Field, Fieldset } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { SettingsSection } from "./section";

export type CalendarSettings = {
  hasCalendar: boolean;
  workingDays: number[];
  workStart: string;
  workEnd: string;
  meetingUrl: string | null;
  busyFetchedAt: string | null;
  busyError: string | null;
  busyCount: number;
};

export function CalendarForm({ calendar }: { calendar: CalendarSettings }) {
  const t = useTranslations("interviews.calendar");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const router = useRouter();
  const [icsUrl, setIcsUrl] = useState("");
  const [days, setDays] = useState<number[]>(calendar.workingDays);
  const [workStart, setWorkStart] = useState(calendar.workStart);
  const [workEnd, setWorkEnd] = useState(calendar.workEnd);
  const [meetingUrl, setMeetingUrl] = useState(calendar.meetingUrl ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const err = (key: string) => (errors[key] ? tx(errors[key]!) : undefined);

  const save = (remove = false) =>
    start(async () => {
      const result = await saveCalendarAction({
        icsUrl: remove ? null : icsUrl.trim() || undefined,
        workingDays: days,
        workStart,
        workEnd,
        meetingUrl: meetingUrl.trim() || null,
      });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        else toast({ message: tx(result.error), tone: "danger" });
        return;
      }
      setErrors({});
      setIcsUrl("");
      toast(t("saved"));
      router.refresh();
    });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <SettingsSection title={t("title")} description={t("description")}>
        {calendar.hasCalendar ? (
          calendar.busyError ? (
            <Banner tone="danger">{tx(`interviews.calendar.errors.${calendar.busyError}`)}</Banner>
          ) : (
            <Banner>
              {t("icsSaved", {
                count: calendar.busyCount,
                when: calendar.busyFetchedAt ? formatRelative(calendar.busyFetchedAt, locale) : "",
              })}
            </Banner>
          )
        ) : null}
        <Field
          label={t("icsUrl")}
          qualifier={tx("common.optional")}
          hint={calendar.hasCalendar ? `${t("icsKeep")} ${t("icsHint")}` : t("icsHint")}
          error={err("icsUrl")}
        >
          <Input
            type="url"
            inputMode="url"
            value={icsUrl}
            autoComplete="off"
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            onChange={(e) => setIcsUrl(e.target.value)}
          />
        </Field>
        <Fieldset legend={t("days")}>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setDays((current) =>
                      on ? current.filter((d) => d !== day) : [...current, day].sort(),
                    )
                  }
                  className={cn(
                    "h-8 min-w-12 rounded-sm border px-2 text-13 font-medium transition-colors duration-[120ms]",
                    on
                      ? "border-cobalt bg-cobalt text-paper"
                      : "border-line-strong bg-paper text-ink hover:bg-stone",
                  )}
                >
                  {tx(`interviews.calendar.weekdays.${day}`)}
                </button>
              );
            })}
          </div>
        </Fieldset>
        <Fieldset legend={t("hours")}>
          <div className="flex flex-wrap items-start gap-3">
            <Field label={t("start")} error={err("workStart")}>
              <Input
                type="time"
                step={900}
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className="w-32"
              />
            </Field>
            <Field label={t("end")}>
              <Input
                type="time"
                step={900}
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className="w-32"
              />
            </Field>
          </div>
        </Fieldset>
        <Field
          label={t("meetingUrl")}
          qualifier={tx("common.optional")}
          hint={t("meetingUrlHint")}
          error={err("meetingUrl")}
        >
          <Input
            type="url"
            inputMode="url"
            value={meetingUrl}
            placeholder="https://meet.google.com/…"
            onChange={(e) => setMeetingUrl(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          {calendar.hasCalendar ? (
            <Button variant="ghost" disabled={pending} onClick={() => save(true)}>
              {t("removeIcs")}
            </Button>
          ) : null}
          <Button type="submit" variant="primary" loading={pending}>
            {t("save")}
          </Button>
        </div>
      </SettingsSection>
    </form>
  );
}
