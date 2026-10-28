"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { rejectAction } from "@/app/(app)/(backoffice)/jobs/[jobId]/actions";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { rejectionReasons, type RejectionReason } from "@/lib/services/rejection-reasons";
import { draftFromTemplate, EmailFields, type EmailDraft, type Recipient, type TemplateOption } from "./email-fields";

export function RejectDialog({
  open,
  onOpenChange,
  recipients,
  templates,
  companyName,
  recruiterName,
  onRejected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: Recipient[];
  templates: TemplateOption[];
  companyName: string;
  recruiterName: string;
  onRejected: (applicationIds: string[]) => void;
}) {
  const t = useTranslations("reject");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const rejectionTemplates = templates.filter((tpl) => tpl.kind === "rejection");
  const [reason, setReason] = useState<RejectionReason>("profile_mismatch");
  const [sendEmail, setSendEmail] = useState(true);
  const [draft, setDraft] = useState<EmailDraft>(() => draftFromTemplate(rejectionTemplates[0]));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const count = recipients.length;

  const confirm = () =>
    start(async () => {
      const ids = recipients.map((r) => r.applicationId);
      const result = await rejectAction(ids, { reason, email: sendEmail ? draft : null });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        else toast({ message: tx(result.error), tone: "danger" });
        return;
      }
      const logged = result.data.statuses.includes("logged");
      toast(logged ? t("doneLogged", { count: result.data.rejected }) : t("done", { count: result.data.rejected }));
      onRejected(ids);
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="lg" closeLabel={tx("common.close")} title={t("title", { count })} description={t("description", { count })}>
        <form
          noValidate
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            <Field label={t("reason")} hint={t("reasonHint")}>
              <Select
                value={reason}
                onChange={(e) => {
                  const next = e.target.value as RejectionReason;
                  setReason(next);
                  if (next === "candidate_withdrew") setSendEmail(false);
                }}
              >
                {rejectionReasons.map((r) => (
                  <option key={r} value={r}>
                    {t(`reasons.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox id="reject-send-email" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} label={t("sendEmail", { count })} />
            {sendEmail ? (
              <div className="border-t border-line pt-4">
                {rejectionTemplates.length === 0 ? <Banner className="mb-4">{tx("emailComposer.noTemplates")}</Banner> : null}
                <EmailFields
                  draft={draft}
                  onChange={(d) => {
                    setDraft(d);
                    setErrors({});
                  }}
                  templates={rejectionTemplates}
                  preview={recipients[0]}
                  companyName={companyName}
                  recruiterName={recruiterName}
                  errors={errors}
                  locale={locale}
                />
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{tx("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant="danger" loading={pending}>
              {t("confirm", { count })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
