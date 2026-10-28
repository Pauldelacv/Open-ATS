"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, type FormEvent } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import { Dropzone } from "@/components/ui/dropzone";
import { Field, Fieldset } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { loose } from "@/i18n/loose";
import { applicationSchema, CV_ACCEPT, cvError, type PublicQuestion } from "@/lib/validation/application";

type Values = { firstName: string; lastName: string; email: string; phone: string; link: string; message: string };
const scalarFields = ["firstName", "lastName", "email", "phone", "link", "message"] as const;

export function ApplyForm({
  orgSlug,
  jobSlug,
  company,
  retentionMonths,
  questions,
  locale,
}: {
  orgSlug: string;
  jobSlug: string;
  company: string;
  retentionMonths: number;
  questions: PublicQuestion[];
  locale: string;
}) {
  const t = useTranslations("careers");
  const tx = loose(useTranslations());
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Values>({ firstName: "", lastName: "", email: "", phone: "", link: "", message: "" });
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(questions.map((q) => [q.id, ""])));
  const [consent, setConsent] = useState(false);
  const [cv, setCv] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const schema = applicationSchema(questions);

  const payload = () => ({ ...values, answers, consent });

  const validateOne = (key: string) => {
    const result = schema.safeParse(payload());
    const issue = result.success ? undefined : result.error.issues.find((i) => i.path.map(String).join(".") === key);
    setErrors((prev) => ({ ...prev, [key]: issue?.message ?? "" }));
  };

  const setValue = (key: keyof Values, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const focusFirstError = (keys: string[]) => {
    requestAnimationFrame(() => {
      const form = formRef.current;
      if (!form) return;
      for (const key of keys) {
        const el = form.querySelector<HTMLElement>(`[data-field="${key}"] input, [data-field="${key}"] textarea, [data-field="${key}"] select`);
        if (el) {
          el.focus();
          return;
        }
      }
    });
  };

  const order = ["firstName", "lastName", "email", "phone", "link", "cv", "message", ...questions.map((q) => `answers.${q.id}`), "consent"];

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const result = schema.safeParse(payload());
    const next: Record<string, string> = {};
    if (!result.success) for (const issue of result.error.issues) next[issue.path.map(String).join(".")] ??= issue.message;
    const fileError = cvError(cv ? { name: cv.name, type: cv.type, size: cv.size } : null);
    if (fileError) next.cv = fileError;
    if (Object.keys(next).length > 0) {
      setErrors(next);
      setFormError("careers.errors.fixFields");
      focusFirstError(order.filter((k) => next[k]));
      return;
    }
    const body = new FormData();
    for (const key of scalarFields) body.set(key, values[key]);
    for (const q of questions) body.set(`answer:${q.id}`, answers[q.id] ?? "");
    body.set("consent", consent ? "true" : "");
    body.set("cv", cv!);
    body.set("website", (formRef.current?.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "");
    setPending(true);
    try {
      const res = await fetch(`/api/careers/${orgSlug}/jobs/${jobSlug}/apply`, { method: "POST", body });
      const data = (await res.json()) as { ok: boolean; error?: string; fieldErrors?: Record<string, string> };
      if (!data.ok) {
        setPending(false);
        setErrors(data.fieldErrors ?? {});
        setFormError(data.error ?? "careers.errors.server");
        if (data.fieldErrors) focusFirstError(order.filter((k) => data.fieldErrors![k]));
        return;
      }
      router.push(`/careers/${orgSlug}/jobs/${jobSlug}/confirmation`);
    } catch {
      setPending(false);
      setFormError("careers.errors.network");
    }
  };

  const err = (key: string) => (errors[key] ? tx(errors[key]!) : undefined);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <p className="text-14 text-ink-muted">{t("apply.intro")}</p>
      {formError ? <Banner tone="danger">{tx(formError)}</Banner> : null}

      <Fieldset legendClassName="mb-4 text-20 font-semibold" legend={t("apply.identity")} className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="firstName">
            <Field size="lg" label={t("apply.firstName")} error={err("firstName")}>
              <Input size="lg" autoComplete="given-name" value={values.firstName} onChange={(e) => setValue("firstName", e.target.value)} onBlur={() => values.firstName && validateOne("firstName")} />
            </Field>
          </div>
          <div data-field="lastName">
            <Field size="lg" label={t("apply.lastName")} error={err("lastName")}>
              <Input size="lg" autoComplete="family-name" value={values.lastName} onChange={(e) => setValue("lastName", e.target.value)} onBlur={() => values.lastName && validateOne("lastName")} />
            </Field>
          </div>
        </div>
        <div data-field="email">
          <Field size="lg" label={t("apply.email")} error={err("email")}>
            <Input size="lg" type="email" inputMode="email" autoComplete="email" value={values.email} onChange={(e) => setValue("email", e.target.value)} onBlur={() => values.email && validateOne("email")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="phone">
            <Field size="lg" label={t("apply.phone")} qualifier={tx("common.optional")} error={err("phone")}>
              <Input size="lg" type="tel" inputMode="tel" autoComplete="tel" value={values.phone} onChange={(e) => setValue("phone", e.target.value)} onBlur={() => values.phone && validateOne("phone")} />
            </Field>
          </div>
          <div data-field="link">
            <Field size="lg" label={t("apply.link")} qualifier={tx("common.optional")} error={err("link")}>
              <Input size="lg" type="url" inputMode="url" autoComplete="url" placeholder={t("apply.linkPlaceholder")} value={values.link} onChange={(e) => setValue("link", e.target.value)} onBlur={() => values.link && validateOne("link")} />
            </Field>
          </div>
        </div>
      </Fieldset>

      <Fieldset legendClassName="mb-4 text-20 font-semibold" legend={t("apply.documents")} className="gap-4">
        <div data-field="cv" className="flex flex-col gap-1.5">
          <label htmlFor="apply-cv" className="text-14 font-medium">
            {t("apply.cv")}
          </label>
          <Dropzone
            id="apply-cv"
            size="lg"
            file={cv}
            onFile={(file) => {
              setCv(file);
              setErrors((prev) => ({ ...prev, cv: file ? (cvError({ name: file.name, type: file.type, size: file.size }) ?? "") : "" }));
            }}
            accept={CV_ACCEPT}
            locale={locale}
            error={err("cv")}
            labels={{
              prompt: t("apply.cvPrompt"),
              browse: t("apply.cvBrowse"),
              constraints: t("apply.cvConstraints"),
              replace: tx("ui.dropzone.replace"),
              remove: tx("ui.dropzone.remove"),
            }}
          />
          {err("cv") ? (
            <p className="text-13 text-danger" role="alert">
              {err("cv")}
            </p>
          ) : null}
        </div>
        <div data-field="message">
          <Field size="lg" label={t("apply.message")} qualifier={tx("common.optional")} hint={t("apply.messageHint")} error={err("message")}>
            <Textarea size="lg" rows={5} value={values.message} onChange={(e) => setValue("message", e.target.value)} />
          </Field>
        </div>
      </Fieldset>

      {questions.length > 0 ? (
        <Fieldset legendClassName="mb-4 text-20 font-semibold" legend={t("apply.questions")} className="gap-5">
          {questions.map((q) => {
            const key = `answers.${q.id}`;
            const set = (value: string) => {
              setAnswers((prev) => ({ ...prev, [q.id]: value }));
              if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
            };
            const qualifier = q.required ? undefined : tx("common.optional");
            if (q.type === "yes_no") {
              return (
                <div key={q.id} data-field={key}>
                  <Fieldset legend={<span className="text-14">{q.label}{qualifier ? <span className="font-normal text-ink-muted"> {qualifier}</span> : null}</span>} error={err(key)}>
                    <div className="flex gap-6">
                      <Radio id={`${q.id}-yes`} name={q.id} value="yes" checked={answers[q.id] === "yes"} onChange={() => set("yes")} label={t("apply.yes")} />
                      <Radio id={`${q.id}-no`} name={q.id} value="no" checked={answers[q.id] === "no"} onChange={() => set("no")} label={t("apply.no")} />
                    </div>
                  </Fieldset>
                </div>
              );
            }
            if (q.type === "single_choice") {
              return (
                <div key={q.id} data-field={key}>
                  <Field size="lg" label={q.label} qualifier={qualifier} error={err(key)}>
                    <Select size="lg" value={answers[q.id]} onChange={(e) => set(e.target.value)}>
                      <option value="">{t("apply.choose")}</option>
                      {q.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              );
            }
            return (
              <div key={q.id} data-field={key}>
                <Field size="lg" label={q.label} qualifier={qualifier} error={err(key)}>
                  {q.type === "long_text" ? (
                    <Textarea size="lg" rows={4} value={answers[q.id]} onChange={(e) => set(e.target.value)} onBlur={() => q.required && answers[q.id] && validateOne(key)} />
                  ) : (
                    <Input size="lg" value={answers[q.id]} onChange={(e) => set(e.target.value)} onBlur={() => q.required && answers[q.id] && validateOne(key)} />
                  )}
                </Field>
              </div>
            );
          })}
        </Fieldset>
      ) : null}

      {/* Honeypot, hidden from people and assistive technologies. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div data-field="consent" className="flex flex-col gap-1.5">
        <Checkbox
          id="apply-consent"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (errors.consent) setErrors((prev) => ({ ...prev, consent: "" }));
          }}
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby={errors.consent ? "apply-consent-error" : undefined}
          className="text-16"
          label={
            <span className="text-14">
              {t("apply.consent", { company, months: retentionMonths })}{" "}
              <a href={`/careers/${orgSlug}/privacy`} target="_blank" rel="noopener" className="text-brand-link underline underline-offset-2">
                {t("apply.consentLink")}
              </a>
            </span>
          }
        />
        {errors.consent ? (
          <p id="apply-consent-error" className="pl-6.5 text-13 text-danger" role="alert">
            {err("consent")}
          </p>
        ) : null}
      </div>

      <Button type="submit" variant="brand" size="lg" loading={pending} className="w-full sm:w-auto sm:self-start">
        {pending ? t("apply.sending") : t("apply.submit")}
      </Button>
    </form>
  );
}
