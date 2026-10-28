"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  addNoteAction,
  deleteNoteAction,
  saveEvaluationAction,
} from "@/app/(app)/(backoffice)/jobs/[jobId]/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Textarea } from "@/components/ui/input";
import { Mark } from "@/components/ui/mark";
import { RatingDots, RatingInput } from "@/components/ui/rating";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { noteSegments } from "@/lib/mentions";
import type { ApplicationDetail } from "@/lib/services/candidates";
import { NoteComposer } from "./note-composer";

type Detail = ApplicationDetail;

export function ApplicationSection({ detail }: { detail: Detail }) {
  const t = useTranslations("panel.application");
  const locale = useLocale();
  const { application, candidate } = detail;
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-14">
        <div>
          <dt className="text-12 text-ink-muted">{t("applied")}</dt>
          <dd className="tabular-nums">
            {t("appliedOn", { date: formatDate(application.createdAt, locale) })}
          </dd>
        </div>
        <div>
          <dt className="text-12 text-ink-muted">{t("source")}</dt>
          <dd>{t(`sources.${application.source}`)}</dd>
        </div>
        {candidate.phone ? (
          <div>
            <dt className="text-12 text-ink-muted">{t("phone")}</dt>
            <dd className="tabular-nums">
              <a href={`tel:${candidate.phone.replace(/\s+/g, "")}`} className="hover:underline">
                {candidate.phone}
              </a>
            </dd>
          </div>
        ) : null}
        {candidate.linkUrl ? (
          <div className="min-w-0">
            <dt className="text-12 text-ink-muted">{t("link")}</dt>
            <dd className="truncate">
              <a
                href={candidate.linkUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-cobalt hover:underline"
              >
                {candidate.linkUrl.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            </dd>
          </div>
        ) : null}
        {application.consentAt ? (
          <div className="col-span-2">
            <dt className="text-12 text-ink-muted">{t("consent")}</dt>
            <dd title={application.consentText ?? undefined} className="tabular-nums">
              {t("consentOn", { date: formatDateTime(application.consentAt, locale) })}
            </dd>
          </div>
        ) : null}
      </dl>

      <section>
        <h3 className="text-13 font-semibold">{t("message")}</h3>
        {application.message ? (
          <p className="mt-1.5 text-14 whitespace-pre-line">{application.message}</p>
        ) : (
          <p className="mt-1.5 text-14 text-ink-muted">{t("noMessage")}</p>
        )}
      </section>

      <section>
        <h3 className="text-13 font-semibold">{t("answers")}</h3>
        {application.answers.length === 0 ? (
          <p className="mt-1.5 text-14 text-ink-muted">{t("noAnswers")}</p>
        ) : (
          <dl className="mt-2 flex flex-col gap-3">
            {application.answers.map((a) => (
              <div key={a.questionId}>
                <dt className="text-13 text-ink-muted">{a.label}</dt>
                <dd className="text-14 whitespace-pre-line">
                  {a.type === "yes_no" ? t(a.value === "yes" ? "yes" : "no") : a.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {detail.otherApplications.length > 0 ? (
        <section>
          <h3 className="text-13 font-semibold">{t("otherApplications")}</h3>
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {detail.otherApplications.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/jobs/${a.jobId}?a=${a.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-14 hover:bg-stone"
                >
                  <span className="min-w-0 truncate">{a.jobTitle}</span>
                  <Badge
                    tone={
                      a.stageKind === "rejected"
                        ? "danger"
                        : a.stageKind === "hired"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {a.stageName}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function NotesSection({
  detail,
  meId,
  canNote,
  onChanged,
}: {
  detail: Detail;
  meId: string;
  canNote: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("panel.notes");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const [pending, start] = useTransition();
  const names = new Map(detail.team.map((m) => [m.id, m.name]));
  const team = detail.team.filter((m) => m.id !== meId);

  const add = (body: string) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const result = await addNoteAction({
          candidateId: detail.candidate.id,
          applicationId: detail.application.id,
          body,
        });
        if (!result.ok) {
          toast({ message: tx(result.error), tone: "danger" });
          return resolve(false);
        }
        toast(t("added"));
        onChanged();
        resolve(true);
      }),
    );

  return (
    <div className="flex flex-col gap-5">
      {canNote ? <NoteComposer team={team} onSubmit={add} pending={pending} /> : null}
      {detail.notes.length === 0 ? (
        <EmptyState className="py-6" title={t("none")} description={t("noneBody")} />
      ) : (
        <ol className="flex flex-col gap-4">
          {detail.notes.map((note) => (
            <li key={note.id} className="flex gap-3">
              <Avatar name={note.authorName ?? "?"} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-13 font-medium">{note.authorName ?? "?"}</span>
                  <time
                    dateTime={new Date(note.createdAt).toISOString()}
                    title={formatDateTime(note.createdAt, locale)}
                    className="text-12 text-ink-muted tabular-nums"
                  >
                    {formatRelative(note.createdAt, locale)}
                  </time>
                  {note.jobTitle && note.applicationId !== detail.application.id ? (
                    <span className="text-12 text-ink-muted">
                      {t("about", { job: note.jobTitle })}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-14 break-words whitespace-pre-line">
                  {noteSegments(note.body).map((segment, i) =>
                    segment.type === "text" ? (
                      <span key={i}>{segment.text}</span>
                    ) : segment.userId === meId ? (
                      <Mark key={i}>@{names.get(segment.userId) ?? "?"}</Mark>
                    ) : (
                      <span key={i} className="font-medium text-cobalt">
                        @{names.get(segment.userId) ?? "?"}
                      </span>
                    ),
                  )}
                </p>
              </div>
              {note.authorId === meId ? (
                <IconButton
                  size="sm"
                  label={t("delete")}
                  onClick={() =>
                    start(async () => {
                      const result = await deleteNoteAction(note.id);
                      if (!result.ok)
                        return void toast({ message: tx(result.error), tone: "danger" });
                      toast(t("deleted"));
                      onChanged();
                    })
                  }
                >
                  <Trash2 />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function EvaluationsSection({
  detail,
  canEvaluate,
  onChanged,
  pendingRating,
}: {
  detail: Detail;
  canEvaluate: boolean;
  onChanged: () => void;
  pendingRating: number | null;
}) {
  const t = useTranslations("panel.evaluations");
  const tr = useTranslations("ui.rating");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const { mine, others, hiddenCount, average } = detail.evaluations;
  const [rating, setRating] = useState<number | null>(pendingRating ?? mine?.rating ?? null);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const valueLabels = [1, 2, 3, 4, 5].map((n) => tr("value", { value: n }));
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 });

  return (
    <div className="flex flex-col gap-6">
      {canEvaluate ? (
        <form
          noValidate
          className="flex flex-col gap-3 rounded-md border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!rating) return setError("panel.evaluations.ratingRequired");
            start(async () => {
              const result = await saveEvaluationAction({
                applicationId: detail.application.id,
                rating,
                comment,
              });
              if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
              setError(null);
              toast(t("saved"));
              onChanged();
            });
          }}
        >
          <h3 className="text-13 font-semibold">{t("yours")}</h3>
          <RatingInput
            value={rating}
            onChange={(v) => {
              setRating(v);
              setError(null);
            }}
            label={t("rating")}
            valueLabels={valueLabels}
          />
          {error ? (
            <p className="text-13 text-danger" role="alert">
              {tx(error)}
            </p>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-13 font-medium">{t("comment")}</span>
            <Textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("commentPlaceholder")}
            />
          </label>
          <Button type="submit" size="sm" variant="primary" loading={pending} className="self-end">
            {t("save")}
          </Button>
        </form>
      ) : null}

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-13 font-semibold">{t("team")}</h3>
          {average !== null ? (
            <span className="flex items-center gap-2 text-13 text-ink-muted tabular-nums">
              {t("average")}
              <RatingDots value={average} label={tr("average", { value: fmt(average) })} />
              <span className="text-ink">{tr("value", { value: fmt(average) })}</span>
            </span>
          ) : null}
        </div>
        {hiddenCount > 0 ? (
          <p className="mt-2 rounded-md border border-line bg-stone px-3 py-2.5 text-14">
            {t("hidden", { count: hiddenCount })}
          </p>
        ) : others.length === 0 ? (
          <p className="mt-2 text-14 text-ink-muted">{mine ? t("onlyYou") : t("noneYet")}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {others.map((e) => (
              <li key={e.id} className="flex gap-3">
                <Avatar name={e.authorName} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3">
                    <span className="text-13 font-medium">{e.authorName}</span>
                    <RatingDots value={e.rating} label={tr("value", { value: e.rating })} />
                    <span className="text-12 text-ink-muted tabular-nums">
                      {tr("value", { value: e.rating })}
                    </span>
                  </div>
                  {e.comment ? (
                    <p className="mt-1 text-14 whitespace-pre-line">{e.comment}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ActivitySection({ detail }: { detail: Detail }) {
  const t = useTranslations("panel.activity");
  const tr = useTranslations("reject.reasons");
  const tx = loose(useTranslations());
  const locale = useLocale();
  if (detail.activity.length === 0) return <p className="text-14 text-ink-muted">{t("none")}</p>;
  return (
    <ol className="relative flex flex-col gap-4 border-l border-line pl-4">
      {detail.activity.map((a) => {
        const data = a.data as Record<string, string | number | boolean | null>;
        const values = {
          actor: a.actorName ?? t("system"),
          job: a.jobTitle ?? "",
          to: String(data.to ?? ""),
          subject: String(data.subject ?? ""),
          tag: String(data.tag ?? ""),
        };
        return (
          <li key={a.id} className="relative">
            <span
              aria-hidden="true"
              className="absolute top-1.5 -left-[21px] size-2 rounded-full border border-line-strong bg-paper"
            />
            <p className="text-14">
              {tx(`panel.activity.types.${a.type}`, values)}
              {a.type === "rejected" && data.reason ? (
                <span className="text-ink-muted"> ({tr(String(data.reason) as "other")})</span>
              ) : null}
              {a.type === "email_sent" && data.status === "logged" ? (
                <span className="text-ink-muted"> ({t("emailLogged")})</span>
              ) : null}
              {a.type === "email_sent" && data.status === "failed" ? (
                <span className="text-danger"> ({t("emailFailed")})</span>
              ) : null}
            </p>
            <time
              dateTime={new Date(a.createdAt).toISOString()}
              title={formatDateTime(a.createdAt, locale)}
              className="text-12 text-ink-muted tabular-nums"
            >
              {formatRelative(a.createdAt, locale)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
