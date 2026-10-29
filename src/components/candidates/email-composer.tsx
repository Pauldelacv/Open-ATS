"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { sendEmailAction } from "@/app/(app)/(backoffice)/jobs/[jobId]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import {
  draftFromTemplate,
  EmailFields,
  type EmailDraft,
  type Recipient,
  type TemplateOption,
} from "./email-fields";

export function EmailComposer({
  open,
  onOpenChange,
  recipients,
  templates,
  companyName,
  recruiterName,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: Recipient[];
  templates: TemplateOption[];
  companyName: string;
  recruiterName: string;
  onSent?: () => void;
}) {
  const t = useTranslations("emailComposer");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const ordered = [...templates].sort(
    (a, b) => (a.kind === "interview" ? -1 : 0) - (b.kind === "interview" ? -1 : 0),
  );
  const [draft, setDraft] = useState<EmailDraft>(() => draftFromTemplate(undefined));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const count = recipients.length;

  const send = () =>
    start(async () => {
      const result = await sendEmailAction(
        recipients.map((r) => r.applicationId),
        draft,
      );
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        else toast({ message: tx(result.error), tone: "danger" });
        return;
      }
      const statuses = result.data.statuses;
      if (statuses.includes("failed")) toast({ message: t("failed"), tone: "danger" });
      else if (statuses.includes("logged")) toast(t("logged", { count: statuses.length }));
      else toast(t("sent", { count: statuses.length }));
      setDraft(draftFromTemplate(undefined));
      setErrors({});
      onOpenChange(false);
      onSent?.();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        width="lg"
        closeLabel={tx("common.close")}
        title={count > 1 ? t("titleMany", { count }) : t("title")}
        description={
          count === 1 && recipients[0]
            ? `${t("to")} ${recipients[0].firstName} ${recipients[0].lastName}${recipients[0].email ? ` <${recipients[0].email}>` : ""}`
            : undefined
        }
      >
        <form
          noValidate
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <DialogBody>
            <EmailFields
              draft={draft}
              onChange={(d) => {
                setDraft(d);
                setErrors({});
              }}
              templates={ordered}
              preview={recipients[0]}
              companyName={companyName}
              recruiterName={recruiterName}
              errors={errors}
              locale={locale}
            />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{tx("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {count > 1 ? t("sendMany", { count }) : t("send")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
