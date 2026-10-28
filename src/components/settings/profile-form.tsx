"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { changePasswordAction, saveProfileAction } from "@/app/(app)/(backoffice)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { SettingsSection } from "./section";

export function ProfileForm({
  name: initialName,
  email,
  locale: initialLocale,
}: {
  name: string;
  email: string;
  locale: "fr" | "en";
}) {
  const t = useTranslations("settings.profile");
  const tx = loose(useTranslations());
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [locale, setLocale] = useState(initialLocale);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, start] = useTransition();
  const [passwordPending, startPassword] = useTransition();
  const err = (k: string) => (errors[k] ? tx(errors[k]!) : undefined);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-20 font-semibold">{t("title")}</h2>
        <p className="mt-0.5 text-14 text-ink-muted">{t("description")}</p>
      </div>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const result = await saveProfileAction({ name, locale });
            if (!result.ok) return void setErrors(result.fieldErrors ?? {});
            setErrors({});
            toast(tx("settings.profile.saved"));
            router.refresh();
          });
        }}
      >
        <SettingsSection title={t("details")}>
          <Field label={t("name")} error={err("name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label={t("email")}>
            <Input value={email} readOnly disabled />
          </Field>
          <Field label={t("language")}>
            <Select value={locale} onChange={(e) => setLocale(e.target.value as "fr" | "en")}>
              <option value="fr">{tx("common.languages.fr")}</option>
              <option value="en">{tx("common.languages.en")}</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={pending}>
              {t("save")}
            </Button>
          </div>
        </SettingsSection>
      </form>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          startPassword(async () => {
            const result = await changePasswordAction({
              currentPassword: current,
              newPassword: next,
            });
            if (!result.ok) return void setErrors(result.fieldErrors ?? {});
            setErrors({});
            setCurrent("");
            setNext("");
            toast(tx("settings.profile.passwordChanged"));
          });
        }}
      >
        <SettingsSection title={t("password")} description={t("passwordDescription")}>
          <Field label={t("currentPassword")} error={err("currentPassword")}>
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field
            label={t("newPassword")}
            hint={tx("auth.setup.passwordHint")}
            error={err("newPassword")}
          >
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={passwordPending}>
              {t("changePassword")}
            </Button>
          </div>
        </SettingsSection>
      </form>
    </div>
  );
}
