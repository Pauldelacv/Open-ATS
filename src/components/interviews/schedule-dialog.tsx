"use client";

import { Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  findSlotsAction,
  proposeSlotsAction,
  scheduleInterviewAction,
  schedulingDefaultsAction,
} from "@/app/(app)/(backoffice)/interviews/actions";
import {
  draftFromTemplate,
  EmailFields,
  type EmailDraft,
  type Recipient,
} from "@/components/candidates/email-fields";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Fieldset } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { cn } from "@/lib/cn";
import type { EmailTemplateKind, LocationKind } from "@/lib/db/schema";
import { formatDayIn, formatTimeIn } from "@/lib/format";
import { addDays, zonedDate, zonedToUtc } from "@/lib/time/zoned";

type Defaults = {
  meetingUrl: string | null;
  videoBase: string | null;
  timeZone: string;
  templates: Array<{
    id: string;
    name: string;
    kind: EmailTemplateKind;
    subject: string;
    body: string;
  }>;
};
type SlotsResult = {
  key: string;
  data?: {
    slots: Array<{ start: string; end: string }>;
    suggested: Array<{ start: string; end: string }>;
    interviewers: Array<{
      id: string;
      name: string;
      hasCalendar: boolean;
      calendarError: string | null;
    }>;
  };
  error?: string;
};

const DURATIONS = [30, 45, 60, 90];
const isPast = (date: Date) => date.getTime() < Date.now();
const kinds: LocationKind[] = ["video", "onsite", "phone"];

export function ScheduleDialog({
  open,
  onOpenChange,
  applicationId,
  recipient,
  phone,
  jobLocation,
  team,
  meId,
  companyName,
  recruiterName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  recipient: Recipient;
  phone: string | null;
  jobLocation: string | null;
  team: Array<{ id: string; name: string }>;
  meId: string;
  companyName: string;
  recruiterName: string;
  onDone: () => void;
}) {
  const t = useTranslations("interviews.dialog");
  const tl = useTranslations("interviews.locationLine");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [mode, setMode] = useState<"slots" | "date">("slots");
  const [step, setStep] = useState<1 | 2>(1);
  const [interviewers, setInterviewers] = useState<string[]>([meId]);
  const [duration, setDuration] = useState(45);
  const [kind, setKind] = useState<LocationKind>("video");
  const [location, setLocation] = useState<Record<LocationKind, string>>({
    video: "",
    onsite: jobLocation ?? "",
    phone: "",
  });
  const zone = defaults?.timeZone ?? "Europe/Paris";
  const today = zonedDate(new Date(), zone);
  const [from, setFrom] = useState(() => addDays(today, 1));
  const [to, setTo] = useState(() => addDays(today, 14));
  const [date, setDate] = useState(() => addDays(today, 1));
  const [time, setTime] = useState("10:00");
  const [result, setResult] = useState<SlotsResult | null>(null);
  const [selection, setSelection] = useState<{ key: string; values: Set<string> } | null>(null);
  const [draft, setDraft] = useState<EmailDraft>(() => draftFromTemplate(undefined));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void schedulingDefaultsAction().then((r) => {
      if (cancelled || !r.ok) return;
      setDefaults(r.data);
      if (r.data.meetingUrl)
        setLocation((current) => ({ ...current, video: current.video || r.data.meetingUrl! }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const key = JSON.stringify({ interviewers, duration, from, to });
  useEffect(() => {
    if (mode !== "slots" || !open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void findSlotsAction({
        applicationId,
        interviewerIds: interviewers,
        durationMinutes: duration,
        from,
        to,
      }).then((r) => {
        if (cancelled) return;
        setResult(r.ok ? { key, data: r.data } : { key, error: r.error });
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [applicationId, duration, from, interviewers, key, mode, open, to]);

  const loading = mode === "slots" && result?.key !== key;
  const data = result?.key === key ? result.data : undefined;
  const selected = useMemo(
    () =>
      selection?.key === key
        ? selection.values
        : new Set((data?.suggested ?? []).map((s) => s.start)),
    [data, key, selection],
  );
  const toggleSlot = (start: string) => {
    const next = new Set(selected);
    if (next.has(start)) next.delete(start);
    else next.add(start);
    setSelection({ key, values: next });
  };
  const byDay = useMemo(() => {
    const groups = new Map<string, Array<{ start: string; end: string }>>();
    for (const slot of data?.slots ?? []) {
      const day = zonedDate(new Date(slot.start), zone);
      groups.set(day, [...(groups.get(day) ?? []), slot]);
    }
    return [...groups.entries()];
  }, [data, zone]);

  const durationMs = duration * 60_000;
  const where = location[kind].trim();
  const locationText =
    kind === "video"
      ? where
        ? tl("video", { location: where })
        : tl("videoNoLink")
      : kind === "onsite"
        ? where
          ? tl("onsite", { location: where })
          : tl("onsiteNoAddress")
        : where
          ? tl("phone", { location: where })
          : tl("phoneNoNumber");
  const dateStart = date && time ? zonedToUtc(date, time, zone) : null;
  const city = zone.split("/").pop()!.replace(/_/g, " ");
  const whenText = dateStart
    ? `${formatDayIn(dateStart, locale, zone)}, ${formatTimeIn(dateStart, locale, zone)} – ${formatTimeIn(
        new Date(dateStart.getTime() + durationMs),
        locale,
        zone,
      )} (${tx("interviews.zone", { city })})`
    : "";

  const templates = (defaults?.templates ?? []).filter((tpl) =>
    mode === "slots" ? tpl.kind === "slots" : tpl.kind === "booked",
  );

  const goToMessage = () => {
    setFormError(null);
    if (interviewers.length === 0) return setFormError("interviews.dialog.errors.interviewers");
    if (mode === "slots" && selected.size === 0)
      return setFormError("interviews.dialog.errors.slots");
    if (mode === "date" && (!dateStart || isPast(dateStart)))
      return setFormError("interviews.dialog.errors.past");
    if (kind === "video" && where && !/^https?:\/\//i.test(where))
      return setFormError("interviews.dialog.errors.link");
    if (!draft.subject && templates[0]) setDraft(draftFromTemplate(templates[0]));
    setErrors({});
    setStep(2);
  };

  const submit = () =>
    start(async () => {
      setFormError(null);
      const common = {
        applicationId,
        interviewerIds: interviewers,
        durationMinutes: duration,
        locationKind: kind,
        location: where || null,
        email: { subject: draft.subject, body: draft.body, templateId: draft.templateId },
      };
      const response =
        mode === "slots"
          ? await proposeSlotsAction({ ...common, slots: [...selected].sort() })
          : await scheduleInterviewAction({ ...common, start: dateStart!.toISOString() });
      if (!response.ok) {
        if (response.fieldErrors) setErrors(response.fieldErrors);
        else setFormError(response.error);
        return;
      }
      toast(mode === "slots" ? t("slotsSent") : t("scheduled"));
      onOpenChange(false);
      onDone();
    });

  const generateLink = () => {
    if (!defaults?.videoBase) return;
    const room = `${companyName}-${crypto.randomUUID().slice(0, 8)}`
      .normalize("NFD")
      .replace(/[^\w-]+/g, "")
      .toLowerCase();
    setLocation((current) => ({ ...current, video: `${defaults.videoBase}/${room}` }));
  };

  const calendarWarning = data?.interviewers.some((i) => !i.hasCalendar || i.calendarError);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        width="lg"
        title={t("title")}
        description={t("description", { name: `${recipient.firstName} ${recipient.lastName}` })}
        closeLabel={tx("common.close")}
      >
        <form
          noValidate
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 1) goToMessage();
            else submit();
          }}
        >
          <DialogBody className="flex flex-col gap-5">
            {step === 1 ? (
              <>
                <Tabs
                  value={mode}
                  onValueChange={(value) => {
                    setMode(value as "slots" | "date");
                    setDraft(draftFromTemplate(undefined));
                    setFormError(null);
                  }}
                >
                  <TabsList>
                    <TabsTrigger value="slots">{t("modeSlots")}</TabsTrigger>
                    <TabsTrigger value="date">{t("modeDate")}</TabsTrigger>
                  </TabsList>
                </Tabs>

                <Fieldset legend={t("interviewers")}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {team.map((person) => {
                      const status = data?.interviewers.find((i) => i.id === person.id);
                      return (
                        <Checkbox
                          key={person.id}
                          checked={interviewers.includes(person.id)}
                          onChange={(e) =>
                            setInterviewers((current) =>
                              e.target.checked
                                ? [...current, person.id]
                                : current.filter((id) => id !== person.id),
                            )
                          }
                          label={person.name}
                          hint={
                            status && !status.hasCalendar
                              ? t("noCalendar")
                              : status?.calendarError
                                ? t("calendarError")
                                : undefined
                          }
                        />
                      );
                    })}
                  </div>
                </Fieldset>

                <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <Field label={t("duration")}>
                    <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                      {DURATIONS.map((d) => (
                        <option key={d} value={d}>
                          {t("minutes", { count: d })}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Fieldset legend={t("place")}>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1.5">
                      {kinds.map((k) => (
                        <Radio
                          key={k}
                          name="location-kind"
                          checked={kind === k}
                          onChange={() => setKind(k)}
                          label={t(k)}
                        />
                      ))}
                    </div>
                  </Fieldset>
                </div>

                {kind === "video" ? (
                  <Field
                    label={t("videoLink")}
                    qualifier={tx("common.optional")}
                    hint={t("videoLinkHint")}
                  >
                    <div className="flex gap-2">
                      <Input
                        type="url"
                        inputMode="url"
                        value={location.video}
                        placeholder="https://"
                        onChange={(e) => setLocation({ ...location, video: e.target.value })}
                        className="min-w-0 flex-1"
                      />
                      {defaults?.videoBase ? (
                        <Button onClick={generateLink}>
                          <Video aria-hidden="true" />
                          {t("generateLink")}
                        </Button>
                      ) : null}
                    </div>
                  </Field>
                ) : kind === "onsite" ? (
                  <Field label={t("address")} qualifier={tx("common.optional")}>
                    <Input
                      value={location.onsite}
                      onChange={(e) => setLocation({ ...location, onsite: e.target.value })}
                    />
                  </Field>
                ) : (
                  <Field
                    label={t("phoneNumber")}
                    qualifier={tx("common.optional")}
                    hint={phone ? t("phoneHint", { phone }) : undefined}
                  >
                    <Input
                      value={location.phone}
                      onChange={(e) => setLocation({ ...location, phone: e.target.value })}
                    />
                  </Field>
                )}

                {mode === "slots" ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <Field label={t("from")}>
                        <Input
                          type="date"
                          value={from}
                          min={today}
                          onChange={(e) => e.target.value && setFrom(e.target.value)}
                          className="w-40"
                        />
                      </Field>
                      <Field label={t("to")}>
                        <Input
                          type="date"
                          value={to}
                          min={from}
                          onChange={(e) => e.target.value && setTo(e.target.value)}
                          className="w-40"
                        />
                      </Field>
                      <p className="pb-2 text-13 text-ink-muted">{t("zone", { city })}</p>
                    </div>
                    <div aria-live="polite">
                      <p className="text-13 font-medium">{t("slots")}</p>
                      {loading ? (
                        <div className="mt-2 flex flex-col gap-2" aria-label={t("loadingSlots")}>
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-7 w-full" />
                          <Skeleton className="h-4 w-36" />
                          <Skeleton className="h-7 w-2/3" />
                        </div>
                      ) : result?.error ? (
                        <p className="mt-1 text-13 text-danger">{tx(result.error)}</p>
                      ) : byDay.length === 0 ? (
                        <p className="mt-1 text-13 text-ink-muted">{t("noSlots")}</p>
                      ) : (
                        <>
                          <p className="mt-0.5 text-13 text-ink-muted tabular-nums">
                            {t("slotsHint", { count: selected.size })}
                          </p>
                          <div className="mt-2 flex max-h-64 flex-col gap-3 overflow-y-auto pr-1">
                            {byDay.map(([day, slots]) => (
                              <div key={day}>
                                <p className="text-13 text-ink-muted first-letter:uppercase">
                                  {formatDayIn(slots[0]!.start, locale, zone)}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {slots.map((slot) => {
                                    const on = selected.has(slot.start);
                                    return (
                                      <button
                                        key={slot.start}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => toggleSlot(slot.start)}
                                        className={cn(
                                          "h-7 rounded-sm border px-2 text-13 tabular-nums transition-colors duration-[120ms]",
                                          on
                                            ? "border-cobalt bg-cobalt text-paper"
                                            : "border-line-strong bg-paper text-ink hover:bg-stone",
                                        )}
                                      >
                                        {formatTimeIn(slot.start, locale, zone)}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    {calendarWarning ? (
                      <p className="text-12 text-ink-muted">{t("noCalendarHint")}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label={t("date")}>
                      <Input
                        type="date"
                        value={date}
                        min={today}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-40"
                      />
                    </Field>
                    <Field label={t("time")}>
                      <Input
                        type="time"
                        step={900}
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-32"
                      />
                    </Field>
                    <p className="pb-2 text-13 text-ink-muted">{t("zone", { city })}</p>
                  </div>
                )}
              </>
            ) : (
              <EmailFields
                draft={draft}
                onChange={(d) => {
                  setDraft(d);
                  setErrors({});
                }}
                templates={templates}
                preview={recipient}
                companyName={companyName}
                recruiterName={recruiterName}
                errors={errors}
                locale={locale}
                extraVariables={
                  mode === "slots"
                    ? [locale.startsWith("fr") ? "lien_creneaux" : "slots_link"]
                    : locale.startsWith("fr")
                      ? ["date_entretien", "lieu_entretien"]
                      : ["interview_date", "interview_location"]
                }
                extraValues={
                  mode === "slots"
                    ? { slotsLink: t("previewLink") }
                    : { interviewDate: whenText, interviewLocation: locationText }
                }
              />
            )}
            {formError ? <Banner tone="danger">{tx(formError)}</Banner> : null}
          </DialogBody>
          <DialogFooter>
            {step === 2 ? (
              <Button variant="ghost" onClick={() => setStep(1)}>
                {t("back")}
              </Button>
            ) : (
              <DialogClose asChild>
                <Button variant="ghost">{tx("common.cancel")}</Button>
              </DialogClose>
            )}
            <Button type="submit" variant="primary" loading={pending}>
              {step === 1 ? t("next") : mode === "slots" ? t("sendSlots") : t("schedule")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
