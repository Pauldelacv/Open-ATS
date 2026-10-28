"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { toast } from "@/components/ui/toast";
import { saveJobAction } from "@/app/(app)/(backoffice)/jobs/actions";
import { loose } from "@/i18n/loose";
import type { JobStatus, QuestionType } from "@/lib/db/schema";
import {
  contractTypes,
  jobInputSchema,
  questionTypes,
  remotePolicies,
  salaryPeriods,
  type JobInput,
} from "@/lib/validation/jobs";

type QuestionDraft = {
  key: string;
  id?: string;
  label: string;
  type: QuestionType;
  optionsText: string;
  required: boolean;
};

export type JobEditorValue = {
  title: string;
  descriptionHtml: string;
  department: string;
  location: string;
  remote: (typeof remotePolicies)[number];
  contract: (typeof contractTypes)[number];
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: (typeof salaryPeriods)[number];
  questions: Array<{
    id?: string;
    label: string;
    type: QuestionType;
    options: string[];
    required: boolean;
  }>;
  memberIds: string[];
};

type Member = {
  userId: string;
  name: string;
  email: string;
  role: "admin" | "recruiter" | "member";
};

let keySeed = 0;
const newKey = () => `q${++keySeed}`;

export function JobEditor({
  jobId,
  status,
  initial,
  members,
  suggestions,
}: {
  jobId: string | null;
  status: JobStatus | null;
  initial: JobEditorValue;
  members: Member[];
  suggestions: { departments: string[]; locations: string[] };
}) {
  const t = useTranslations();
  const tx = loose(t);
  const router = useRouter();
  const formId = useId();
  const [value, setValue] = useState(initial);
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initial.questions.map((q) => ({
      key: newKey(),
      id: q.id,
      label: q.label,
      type: q.type,
      optionsText: q.options.join("\n"),
      required: q.required,
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [intent, setIntent] = useState<"draft" | "publish" | "save" | null>(null);

  const set = <K extends keyof JobEditorValue>(key: K, v: JobEditorValue[K]) => {
    setValue((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const toInput = (): JobInput => ({
    ...value,
    department: value.department,
    location: value.location,
    salaryMin: value.salaryMin,
    salaryMax: value.salaryMax,
    questions: questions.map((q) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      options: q.optionsText
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean),
      required: q.required,
    })),
  });

  const validateField = (name: "title" | "salaryMin" | "salaryMax") => {
    const result = jobInputSchema.safeParse(toInput());
    const issue = result.success ? undefined : result.error.issues.find((i) => i.path[0] === name);
    setErrors((prev) => ({ ...prev, [name]: issue?.message ?? "" }));
  };

  const submit = (mode: "draft" | "publish" | "save") => {
    setIntent(mode);
    setFormError(null);
    const input = toInput();
    const parsed = jobInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join(".");
        next[key] ??= issue.message;
      }
      setErrors(next);
      setFormError("jobs.editor.fixErrors");
      return;
    }
    start(async () => {
      const result = await saveJobAction(jobId, input, { publish: mode === "publish" });
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        setFormError(result.error);
        return;
      }
      toast(
        t(
          mode === "publish"
            ? "jobs.toasts.published"
            : jobId
              ? "jobs.toasts.saved"
              : "jobs.toasts.created",
        ),
      );
      router.push(`/jobs/${result.data.id}`);
      router.refresh();
    });
  };

  const updateQuestion = (key: string, patch: Partial<QuestionDraft>) =>
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  const moveQuestion = (index: number, delta: number) =>
    setQuestions((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  const err = (key: string) => (errors[key] ? tx(errors[key]) : undefined);
  const richLabels = {
    toolbar: t("ui.richText.toolbar"),
    bold: t("ui.richText.bold"),
    italic: t("ui.richText.italic"),
    heading2: t("ui.richText.heading2"),
    heading3: t("ui.richText.heading3"),
    bulletList: t("ui.richText.bulletList"),
    orderedList: t("ui.richText.orderedList"),
    link: t("ui.richText.link"),
    linkUrl: t("ui.richText.linkUrl"),
    applyLink: t("ui.richText.applyLink"),
    removeLink: t("ui.richText.removeLink"),
  };
  const selectableMembers = members;

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(status === "published" || status === "archived" ? "save" : jobId ? "save" : "draft");
      }}
      className="flex flex-col gap-4 pb-24"
    >
      {formError ? <Banner tone="danger">{tx(formError)}</Banner> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col gap-5 rounded-md border border-line bg-paper p-4 md:p-5">
          <Field label={t("jobs.editor.titleLabel")} error={err("title")}>
            <Input
              size="lg"
              value={value.title}
              onChange={(e) => set("title", e.target.value)}
              onBlur={() => value.title && validateField("title")}
              placeholder={t("jobs.editor.titlePlaceholder")}
              autoFocus={!jobId}
              maxLength={150}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-13 font-medium" id={`${formId}-desc`}>
              {t("jobs.editor.description")}
            </span>
            <RichTextEditor
              value={value.descriptionHtml}
              onChange={(html) => set("descriptionHtml", html)}
              labels={richLabels}
              placeholder={t("jobs.editor.descriptionPlaceholder")}
              describedBy={`${formId}-desc`}
              minHeight="min-h-80"
            />
          </div>
        </section>

        <aside className="flex flex-col gap-4 self-start rounded-md border border-line bg-paper p-4 md:p-5">
          <h2 className="text-16 font-semibold">{t("jobs.editor.details")}</h2>
          <Field label={t("jobs.editor.department")} qualifier={t("common.optional")}>
            <Input
              value={value.department}
              onChange={(e) => set("department", e.target.value)}
              list={`${formId}-departments`}
              placeholder={t("jobs.editor.departmentPlaceholder")}
              maxLength={80}
            />
          </Field>
          <datalist id={`${formId}-departments`}>
            {suggestions.departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <Field label={t("jobs.editor.location")} qualifier={t("common.optional")}>
            <Input
              value={value.location}
              onChange={(e) => set("location", e.target.value)}
              list={`${formId}-locations`}
              placeholder={t("jobs.editor.locationPlaceholder")}
              maxLength={120}
            />
          </Field>
          <datalist id={`${formId}-locations`}>
            {suggestions.locations.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <Field label={t("jobs.editor.contract")}>
            <Select
              value={value.contract}
              onChange={(e) => set("contract", e.target.value as JobEditorValue["contract"])}
            >
              {contractTypes.map((c) => (
                <option key={c} value={c}>
                  {t(`jobs.contract.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("jobs.editor.remote")}>
            <Select
              value={value.remote}
              onChange={(e) => set("remote", e.target.value as JobEditorValue["remote"])}
            >
              {remotePolicies.map((r) => (
                <option key={r} value={r}>
                  {t(`jobs.remote.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
            <legend className="sr-only">{t("jobs.editor.salary")}</legend>
            <div>
              <p className="text-13 font-medium">
                {t("jobs.editor.salary")}{" "}
                <span className="font-normal text-ink-muted">{t("common.optional")}</span>
              </p>
              <p className="mt-0.5 text-13 text-ink-muted">{t("jobs.editor.salaryHint")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("jobs.editor.salaryMin")} error={err("salaryMin")}>
                <Input
                  inputMode="numeric"
                  value={value.salaryMin}
                  onChange={(e) => set("salaryMin", e.target.value)}
                  onBlur={() => validateField("salaryMin")}
                  className="tabular-nums"
                />
              </Field>
              <Field label={t("jobs.editor.salaryMax")} error={err("salaryMax")}>
                <Input
                  inputMode="numeric"
                  value={value.salaryMax}
                  onChange={(e) => set("salaryMax", e.target.value)}
                  onBlur={() => validateField("salaryMax")}
                  className="tabular-nums"
                />
              </Field>
              <Field label={t("jobs.editor.salaryPeriod")}>
                <Select
                  value={value.salaryPeriod}
                  onChange={(e) =>
                    set("salaryPeriod", e.target.value as JobEditorValue["salaryPeriod"])
                  }
                >
                  {salaryPeriods.map((p) => (
                    <option key={p} value={p}>
                      {t(`jobs.salaryPeriodLabel.${p}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("jobs.editor.currency")}>
                <Select
                  value={value.salaryCurrency}
                  onChange={(e) => set("salaryCurrency", e.target.value)}
                >
                  {["EUR", "CHF", "GBP", "USD", "CAD"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </fieldset>
        </aside>
      </div>

      <section
        className="rounded-md border border-line bg-paper p-4 md:p-5"
        aria-labelledby={`${formId}-questions`}
      >
        <h2 id={`${formId}-questions`} className="text-16 font-semibold">
          {t("jobs.editor.questions")}
        </h2>
        <p className="mt-1 max-w-2xl text-13 text-ink-muted">{t("jobs.editor.questionsHint")}</p>
        {questions.length === 0 ? (
          <p className="mt-4 text-14 text-ink-muted">{t("jobs.editor.noQuestions")}</p>
        ) : null}
        <ol className="mt-4 flex flex-col gap-3">
          {questions.map((q, index) => (
            <li key={q.key} className="rounded-md border border-line p-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto]">
                <Field
                  label={t("jobs.editor.questionLabel")}
                  error={err(`questions.${index}.label`)}
                >
                  <Input
                    value={q.label}
                    onChange={(e) => updateQuestion(q.key, { label: e.target.value })}
                    maxLength={300}
                  />
                </Field>
                <Field label={t("jobs.editor.questionType")}>
                  <Select
                    value={q.type}
                    onChange={(e) =>
                      updateQuestion(q.key, { type: e.target.value as QuestionType })
                    }
                  >
                    {questionTypes.map((type) => (
                      <option key={type} value={type}>
                        {t(`jobs.editor.questionTypes.${type}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex items-end gap-1 pb-0.5">
                  <IconButton
                    label={t("jobs.editor.moveUp")}
                    disabled={index === 0}
                    onClick={() => moveQuestion(index, -1)}
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    label={t("jobs.editor.moveDown")}
                    disabled={index === questions.length - 1}
                    onClick={() => moveQuestion(index, 1)}
                  >
                    <ArrowDown />
                  </IconButton>
                  <IconButton
                    label={t("jobs.editor.removeQuestion")}
                    onClick={() => setQuestions((prev) => prev.filter((x) => x.key !== q.key))}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </div>
              {q.type === "single_choice" ? (
                <Field
                  className="mt-3"
                  label={t("jobs.editor.options")}
                  hint={t("jobs.editor.optionsHint")}
                  error={err(`questions.${index}.options`)}
                >
                  <Textarea
                    rows={3}
                    value={q.optionsText}
                    onChange={(e) => updateQuestion(q.key, { optionsText: e.target.value })}
                  />
                </Field>
              ) : null}
              <Checkbox
                id={`${q.key}-required`}
                className="mt-3"
                label={t("jobs.editor.questionRequired")}
                checked={q.required}
                onChange={(e) => updateQuestion(q.key, { required: e.target.checked })}
              />
            </li>
          ))}
        </ol>
        <Button
          className="mt-4"
          onClick={() =>
            setQuestions((prev) => [
              ...prev,
              { key: newKey(), label: "", type: "short_text", optionsText: "", required: false },
            ])
          }
        >
          <Plus aria-hidden="true" />
          {t("jobs.editor.addQuestion")}
        </Button>
      </section>

      <section
        className="rounded-md border border-line bg-paper p-4 md:p-5"
        aria-labelledby={`${formId}-team`}
      >
        <h2 id={`${formId}-team`} className="text-16 font-semibold">
          {t("jobs.editor.team")}
        </h2>
        <p className="mt-1 max-w-2xl text-13 text-ink-muted">{t("jobs.editor.teamHint")}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {selectableMembers.map((m) => (
            <li key={m.userId}>
              <Checkbox
                id={`member-${m.userId}`}
                checked={value.memberIds.includes(m.userId)}
                onChange={(e) =>
                  set(
                    "memberIds",
                    e.target.checked
                      ? [...value.memberIds, m.userId]
                      : value.memberIds.filter((id) => id !== m.userId),
                  )
                }
                label={m.name}
                hint={t(`roles.${m.role}`)}
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper md:left-14 xl:left-54">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 px-4 py-3 md:px-6">
          <Button asChild variant="ghost">
            <Link href={jobId ? `/jobs/${jobId}` : "/jobs"}>{t("jobs.editor.cancel")}</Link>
          </Button>
          {status === null || status === "draft" ? (
            <>
              <Button
                type="submit"
                loading={pending && intent !== "publish"}
                disabled={pending && intent === "publish"}
                onClick={() => setIntent("draft")}
              >
                {t("jobs.editor.saveDraft")}
              </Button>
              <Button
                variant="primary"
                loading={pending && intent === "publish"}
                disabled={pending && intent !== "publish"}
                onClick={() => submit("publish")}
              >
                {t("jobs.editor.publish")}
              </Button>
            </>
          ) : (
            <Button type="submit" variant="primary" loading={pending}>
              {t("jobs.editor.save")}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
