"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteTemplateAction, saveTemplateAction } from "@/app/(app)/(backoffice)/settings/actions";
import { EmailFields, type EmailDraft } from "@/components/candidates/email-fields";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import type { EmailTemplateKind } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";

type Template = { id: string; name: string; kind: EmailTemplateKind; subject: string; body: string };
type JournalEntry = {
  id: string;
  category: "candidate" | "team";
  toEmail: string;
  subject: string;
  body: string;
  status: "sent" | "logged" | "failed";
  error: string | null;
  createdAt: Date;
  senderName: string | null;
};

const kinds: EmailTemplateKind[] = ["confirmation", "rejection", "interview", "other"];
const statusTone: Record<JournalEntry["status"], BadgeTone> = { sent: "success", logged: "warning", failed: "danger" };

export function EmailSettings({
  templates,
  journal,
  smtp,
  companyName,
  recruiterName,
}: {
  templates: Template[];
  journal: JournalEntry[];
  smtp: { configured: boolean; from: string };
  companyName: string;
  recruiterName: string;
}) {
  const t = useTranslations("settings.emails");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-20 font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-14 text-ink-muted">{t("description")}</p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" />
          {t("create")}
        </Button>
      </div>

      {smtp.configured ? (
        <Banner>{t("smtpOk", { from: smtp.from })}</Banner>
      ) : (
        <Banner tone="warning" title={t("smtpMissing")}>
          {t("smtpMissingBody")}
        </Banner>
      )}

      <section className="overflow-hidden rounded-md border border-line bg-paper" aria-labelledby="templates-title">
        <h3 id="templates-title" className="border-b border-line px-4 py-2.5 text-13 font-medium text-ink-muted">
          {t("templates")} <span className="tabular-nums">{templates.length}</span>
        </h3>
        {templates.length === 0 ? (
          <EmptyState title={t("none")} description={t("noneBody")} action={<Button onClick={() => setEditing("new")}>{t("create")}</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {templates.map((tpl) => (
              <li key={tpl.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => setEditing(tpl)} className="truncate text-left text-14 font-medium hover:underline">
                    {tpl.name}
                  </button>
                  <p className="truncate text-13 text-ink-muted">{tpl.subject}</p>
                </div>
                <Badge tone={tpl.kind === "rejection" ? "neutral" : tpl.kind === "confirmation" ? "info" : "muted"}>{t(`kinds.${tpl.kind}`)}</Badge>
                <IconButton label={t("edit")} onClick={() => setEditing(tpl)}>
                  <Pencil />
                </IconButton>
                <IconButton label={t("delete")} onClick={() => setDeleting(tpl)}>
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-md border border-line bg-paper" aria-labelledby="journal-title">
        <div className="border-b border-line px-4 py-2.5">
          <h3 id="journal-title" className="text-13 font-medium text-ink-muted">
            {t("journal")}
          </h3>
          <p className="text-12 text-ink-muted">{t("journalHint")}</p>
        </div>
        {journal.length === 0 ? (
          <p className="px-4 py-6 text-14 text-ink-muted">{t("journalEmpty")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {journal.map((entry) => (
              <li key={entry.id} className="px-4 py-2.5">
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1 basis-60">
                      <span className="block truncate text-14 font-medium group-open:whitespace-normal">{entry.subject}</span>
                      <span className="block truncate text-13 text-ink-muted">
                        {entry.toEmail}
                        {entry.senderName ? <span className="ml-3">{t("by", { name: entry.senderName })}</span> : null}
                      </span>
                    </span>
                    <span className="text-12 text-ink-muted">{t(`category.${entry.category}`)}</span>
                    <Badge tone={statusTone[entry.status]}>{t(`status.${entry.status}`)}</Badge>
                    <time className="w-36 text-right text-12 text-ink-muted tabular-nums">{formatDateTime(entry.createdAt, locale)}</time>
                  </summary>
                  <div className="mt-2 rounded-md border border-line bg-stone px-3 py-2.5 text-14 whitespace-pre-line">
                    {entry.body}
                    {entry.error ? <p className="mt-2 text-13 text-danger">{entry.error}</p> : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing ? (
        <TemplateDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          companyName={companyName}
          recruiterName={recruiterName}
          onSaved={() => router.refresh()}
        />
      ) : null}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        {deleting ? (
          <DialogContent width="sm" title={t("deleteTitle", { name: deleting.name })} closeLabel={tx("common.close")}>
            <DialogBody>
              <p className="text-14">{t("deleteBody")}</p>
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
                    const result = await deleteTemplateAction(deleting.id);
                    if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
                    toast(t("deleted"));
                    setDeleting(null);
                    router.refresh();
                  })
                }
              >
                {t("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function TemplateDialog({
  template,
  onClose,
  onSaved,
  companyName,
  recruiterName,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
  companyName: string;
  recruiterName: string;
}) {
  const t = useTranslations("settings.emails");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const [name, setName] = useState(template?.name ?? "");
  const [kind, setKind] = useState<EmailTemplateKind>(template?.kind ?? "other");
  const [draft, setDraft] = useState<EmailDraft>({ templateId: null, subject: template?.subject ?? "", body: template?.body ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const result = await saveTemplateAction(template?.id ?? null, { name, kind, subject: draft.subject, body: draft.body });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error !== "form") toast({ message: tx(result.error), tone: "danger" });
        return;
      }
      toast(t("saved"));
      onSaved();
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent width="lg" title={template ? t("editTitle") : t("createTitle")} closeLabel={tx("common.close")}>
        <form
          noValidate
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <Field label={t("name")} error={errors.name ? tx(errors.name) : undefined}>
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </Field>
              <Field label={t("kind")}>
                <Select value={kind} onChange={(e) => setKind(e.target.value as EmailTemplateKind)}>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="-mt-2 text-13 text-ink-muted">{t("kindHint")}</p>
            <EmailFields
              draft={draft}
              onChange={(d) => {
                setDraft(d);
                setErrors({});
              }}
              templates={[]}
              hideTemplatePicker
              preview={{ applicationId: "sample", firstName: t("sampleFirstName"), lastName: t("sampleLastName"), jobTitle: t("sampleJob"), email: null }}
              companyName={companyName}
              recruiterName={recruiterName}
              errors={{
                ...(errors.subject ? { subject: errors.subject } : {}),
                ...(errors.body ? { body: errors.body } : {}),
              }}
              locale={locale}
            />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{tx("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
