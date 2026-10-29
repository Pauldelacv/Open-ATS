"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { loose } from "@/i18n/loose";
import { setupSchema } from "@/lib/validation/auth";
import { setupWorkspace } from "./actions";

type FieldName = "name" | "email" | "password" | "company";

export function SetupForm({
  accountExists,
  defaultLocale,
}: {
  accountExists: boolean;
  defaultLocale: string;
}) {
  const t = useTranslations();
  const tx = loose(t);
  const [state, action, pending] = useActionState(setupWorkspace, null);
  const [clientErrors, setClientErrors] = useState<Partial<Record<FieldName, string>>>({});
  const serverErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const errorFor = (name: FieldName) => {
    const key = clientErrors[name] ?? serverErrors[name];
    return key ? tx(key) : undefined;
  };

  const validate = (name: FieldName, value: string) => {
    const result = setupSchema.shape[name].safeParse(value);
    setClientErrors((prev) => ({
      ...prev,
      [name]: result.success ? undefined : result.error.issues[0]?.message,
    }));
  };

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state && !state.ok && state.error !== "form" ? (
        <Banner tone="danger">{tx(state.error)}</Banner>
      ) : null}
      {!accountExists ? (
        <>
          <Field label={t("auth.setup.name")} error={errorFor("name")}>
            <Input
              name="name"
              autoComplete="name"
              autoFocus
              onBlur={(e) => validate("name", e.target.value)}
            />
          </Field>
          <Field label={t("auth.setup.email")} error={errorFor("email")}>
            <Input
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              onBlur={(e) => e.target.value && validate("email", e.target.value)}
            />
          </Field>
          <Field
            label={t("auth.setup.password")}
            hint={t("auth.setup.passwordHint")}
            error={errorFor("password")}
          >
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              onBlur={(e) => e.target.value && validate("password", e.target.value)}
            />
          </Field>
        </>
      ) : null}
      <Field
        label={t("auth.setup.company")}
        hint={t("auth.setup.companyHint")}
        error={errorFor("company")}
      >
        <Input
          name="company"
          autoComplete="organization"
          autoFocus={accountExists}
          onBlur={(e) => validate("company", e.target.value)}
        />
      </Field>
      <Field label={t("auth.setup.language")}>
        <Select name="locale" defaultValue={defaultLocale === "en" ? "en" : "fr"}>
          <option value="fr">{t("common.languages.fr")}</option>
          <option value="en">{t("common.languages.en")}</option>
        </Select>
      </Field>
      <Button type="submit" variant="primary" loading={pending} className="mt-1 w-full">
        {t("auth.setup.submit")}
      </Button>
    </form>
  );
}
