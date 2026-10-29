"use client";

import { Paperclip, Reply } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  markConversationReadAction,
  sendEmailAction,
} from "@/app/(app)/(backoffice)/jobs/[jobId]/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { ApplicationDetail } from "@/lib/services/candidates";

type Message = ApplicationDetail["emails"][number];

const bareSubject = (subject: string) => subject.replace(/^((re|tr|fwd?)\s?:\s*)+/i, "").trim();

function formatSize(bytes: number, locale: string) {
  const kb = bytes / 1024;
  const [value, unit] = kb < 1024 ? [kb, "kilobyte"] : [kb / 1024, "megabyte"];
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    maximumFractionDigits: kb < 1024 ? 0 : 1,
  }).format(value);
}

function MessageItem({
  message,
  showSubject,
  candidateName,
}: {
  message: Message;
  showSubject: boolean;
  candidateName: string;
}) {
  const t = useTranslations("panel.conversation");
  const locale = useLocale();
  const [quoted, setQuoted] = useState(false);
  const inbound = message.direction === "inbound";
  // Sent messages are usually templates: folded to three lines, the replies stay whole.
  const foldable = !inbound && message.body.length > 240;
  const [open, setOpen] = useState(!foldable);
  const author = inbound
    ? (message.fromName ?? candidateName)
    : (message.senderName ?? t("automatic"));
  return (
    <li
      className={cn("rounded-sm border border-line px-3 py-2.5", inbound ? "bg-stone" : "bg-paper")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-13">
          <span className="font-medium text-ink">{author}</span>
          {!inbound ? (
            <span className="text-ink-muted"> {t("to", { email: message.toEmail })}</span>
          ) : null}
          {message.status === "logged" ? (
            <span className="text-ink-muted"> ({t("logged")})</span>
          ) : null}
          {message.status === "failed" ? (
            <span className="text-danger"> ({t("failed")})</span>
          ) : null}
        </p>
        <span className="flex items-center gap-2 text-12 text-ink-muted tabular-nums">
          {inbound && !message.readAt ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-cobalt">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-cobalt" />
              {t("unread")}
            </span>
          ) : null}
          <time
            dateTime={new Date(message.createdAt).toISOString()}
            title={formatDateTime(message.createdAt, locale)}
          >
            {formatRelative(message.createdAt, locale)}
          </time>
        </span>
      </div>
      {showSubject ? <p className="mt-0.5 text-13 text-ink-muted">{message.subject}</p> : null}
      <p className={cn("mt-1.5 text-14 whitespace-pre-wrap text-ink", !open && "line-clamp-3")}>
        {message.body}
      </p>
      {foldable ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 rounded-xs text-12 font-medium text-ink-muted hover:text-ink"
        >
          {open ? t("fold") : t("unfold")}
        </button>
      ) : null}
      {message.fullBody ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setQuoted((v) => !v)}
            aria-expanded={quoted}
            className="rounded-xs text-12 font-medium text-ink-muted hover:text-ink"
          >
            {quoted ? t("hideQuoted") : t("showQuoted")}
          </button>
          {quoted ? (
            <p className="mt-1 border-l border-line-strong pl-3 text-13 whitespace-pre-wrap text-ink-muted">
              {message.fullBody.slice(message.body.length).trim()}
            </p>
          ) : null}
        </div>
      ) : null}
      {message.attachments.length > 0 ? (
        <ul aria-label={t("attachments")} className="mt-2 flex flex-col gap-1">
          {message.attachments.map((file) => (
            <li key={file.id}>
              <a
                href={`/api/files/${file.id}?download`}
                className="inline-flex max-w-full items-center gap-1.5 text-13 text-cobalt hover:underline"
              >
                <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{file.fileName}</span>
                <span className="shrink-0 text-ink-muted tabular-nums">
                  {formatSize(file.size, locale)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Emails sent to and received from the candidate, with an inline reply. */
export function ConversationSection({
  detail,
  canEmail,
  onRead,
  onSent,
}: {
  detail: ApplicationDetail;
  canEmail: boolean;
  /** Received messages were marked read (they keep their marker until the next visit). */
  onRead?: () => void;
  onSent: () => void;
}) {
  const t = useTranslations("panel.conversation");
  const tx = loose(useTranslations());
  const messages = detail.emails;
  const firstName = detail.candidate.firstName;
  const candidateName = `${detail.candidate.firstName} ${detail.candidate.lastName}`;
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  const last = messages.at(-1);
  const [replying, setReplying] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const marked = useRef(false);
  const unread = messages.some((m) => m.direction === "inbound" && !m.readAt);

  // Opening the conversation reads it: the card stops counting it, the markers stay for now.
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  });
  useEffect(() => {
    if (!unread || marked.current) return;
    marked.current = true;
    void markConversationReadAction(detail.candidate.id).then(() => onReadRef.current?.());
  }, [unread, detail.candidate.id]);

  const openReply = () => {
    const base = bareSubject(last?.subject ?? "") || detail.job.title;
    setSubject(`Re: ${base}`);
    setBody("");
    setErrors({});
    setReplying(true);
  };

  const send = () =>
    start(async () => {
      const result = await sendEmailAction([detail.application.id], {
        subject,
        body,
        templateId: null,
        replyToMessageId: lastInbound?.id ?? null,
      });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        else toast({ message: tx(result.error), tone: "danger" });
        return;
      }
      toast(result.data.statuses.includes("logged") ? t("replyLogged") : t("replySent"));
      setReplying(false);
      onSent();
    });

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 ? (
        <div>
          <p className="text-14 text-ink">{t("empty", { name: firstName })}</p>
          <p className="mt-0.5 text-13 text-ink-muted">{t("emptyHint", { name: firstName })}</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              candidateName={candidateName}
              showSubject={
                index === 0 ||
                bareSubject(message.subject) !== bareSubject(messages[index - 1]!.subject)
              }
            />
          ))}
        </ol>
      )}

      {canEmail && detail.candidate.email ? (
        replying ? (
          <form
            noValidate
            className="flex flex-col gap-3 rounded-sm border border-line bg-paper p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Field
              label={t("replySubject")}
              error={errors.subject ? tx(errors.subject) : undefined}
            >
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label={t("replyBody")} error={errors.body ? tx(errors.body) : undefined}>
              <Textarea autoFocus rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReplying(false)}>
                {tx("common.cancel")}
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                {t("sendReply")}
              </Button>
            </div>
          </form>
        ) : messages.length > 0 ? (
          <div>
            <Button onClick={openReply}>
              <Reply aria-hidden="true" />
              {t("reply")}
            </Button>
          </div>
        ) : null
      ) : null}

      {!detail.repliesEnabled ? <p className="text-12 text-ink-muted">{t("repliesOff")}</p> : null}
    </div>
  );
}
