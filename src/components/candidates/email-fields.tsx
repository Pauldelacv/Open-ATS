"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { EmailTemplateKind } from "@/lib/db/schema";
import { loose } from "@/i18n/loose";
import {
  type TemplateValues,
  renderTemplate,
  unknownVariables,
} from "@/lib/services/template-render";

export type TemplateOption = {
  id: string;
  name: string;
  kind: EmailTemplateKind;
  subject: string;
  body: string;
};
export type Recipient = {
  applicationId: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string | null;
};
export type EmailDraft = { templateId: string | null; subject: string; body: string };

export function draftFromTemplate(template: TemplateOption | undefined): EmailDraft {
  return template
    ? { templateId: template.id, subject: template.subject, body: template.body }
    : { templateId: null, subject: "", body: "" };
}

/** Template picker, subject, body with variable shortcuts and a live preview. */
export function EmailFields({
  draft,
  onChange,
  templates,
  preview,
  companyName,
  recruiterName,
  errors,
  locale,
  hideTemplatePicker,
  extraVariables = [],
  extraValues,
}: {
  hideTemplatePicker?: boolean;
  /** Variables of this kind of email, offered after the usual ones (slot link, date…). */
  extraVariables?: string[];
  /** Their values in the preview. */
  extraValues?: TemplateValues;
  draft: EmailDraft;
  onChange: (draft: EmailDraft) => void;
  templates: TemplateOption[];
  preview: Recipient | undefined;
  companyName: string;
  recruiterName: string;
  errors?: Record<string, string>;
  locale: string;
}) {
  const t = useTranslations("emailComposer");
  const tAll = useTranslations();
  const body = useRef<HTMLTextAreaElement>(null);

  const insert = (name: string) => {
    const token = `{{${name}}}`;
    const el = body.current;
    if (!el) return onChange({ ...draft, body: draft.body + token });
    const start = el.selectionStart ?? draft.body.length;
    const end = el.selectionEnd ?? start;
    const next = draft.body.slice(0, start) + token + draft.body.slice(end);
    onChange({ ...draft, body: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const values = preview
    ? {
        firstName: preview.firstName,
        lastName: preview.lastName,
        job: preview.jobTitle,
        company: companyName,
        recruiter: recruiterName,
        ...extraValues,
      }
    : {};
  const unknown = unknownVariables(`${draft.subject} ${draft.body}`);
  const names = locale.startsWith("fr")
    ? ["prénom", "nom", "offre", "entreprise", "recruteur"]
    : ["first_name", "last_name", "job", "company", "recruiter"];
  names.push(...extraVariables);

  return (
    <div className="flex flex-col gap-4">
      {hideTemplatePicker ? null : (
        <Field label={t("template")}>
          <Select
            value={draft.templateId ?? ""}
            onChange={(e) =>
              onChange(draftFromTemplate(templates.find((tpl) => tpl.id === e.target.value)))
            }
          >
            <option value="">{t("noTemplate")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label={t("subject")} error={errors?.subject ? loose(tAll)(errors.subject) : undefined}>
        <Input
          value={draft.subject}
          onChange={(e) => onChange({ ...draft, subject: e.target.value })}
          maxLength={300}
        />
      </Field>
      <Field label={t("body")} error={errors?.body ? loose(tAll)(errors.body) : undefined}>
        <Textarea
          ref={body}
          rows={9}
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
        />
      </Field>
      <div className="-mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-12 text-ink-muted">{t("variables")}</span>
        {names.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => insert(name)}
            aria-label={t("insert", { name })}
            className="h-6 rounded-sm border border-line bg-paper px-1.5 text-12 text-ink hover:border-line-strong"
          >
            {`{{${name}}}`}
          </button>
        ))}
      </div>
      {unknown.length > 0 ? (
        <p className="text-13 text-warning">{t("unknown", { names: unknown.join(", ") })}</p>
      ) : null}
      {preview && (draft.subject || draft.body) ? (
        <div className="rounded-md border border-line bg-stone">
          <p className="border-b border-line px-3 py-2 text-12 text-ink-muted">
            {t("preview", { name: `${preview.firstName} ${preview.lastName}` })}
          </p>
          <div className="px-3 py-2.5">
            <p className="text-14 font-medium">{renderTemplate(draft.subject, values)}</p>
            <p className="mt-2 text-14 whitespace-pre-line text-ink">
              {renderTemplate(draft.body, values)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
