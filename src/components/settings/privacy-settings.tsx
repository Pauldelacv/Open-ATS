"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { runRetentionAction, savePrivacyAction } from "@/app/(app)/(backoffice)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { SettingsSection } from "./section";

export function PrivacySettings({
  months: initialMonths,
  contact: initialContact,
  due,
  upcoming,
  anonymized,
}: {
  months: number;
  contact: string;
  due: number;
  upcoming: number;
  anonymized: number;
}) {
  const t = useTranslations("settings.privacy");
  const tx = loose(useTranslations());
  const router = useRouter();
  const [months, setMonths] = useState(String(initialMonths));
  const [contact, setContact] = useState(initialContact);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [running, startRun] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-20 font-semibold">{t("title")}</h2>
        <p className="mt-0.5 text-14 text-ink-muted">{t("description")}</p>
      </div>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const result = await savePrivacyAction({ retentionMonths: Number(months), privacyContactEmail: contact });
            if (!result.ok) return void setErrors(result.fieldErrors ?? {});
            setErrors({});
            toast(t("saved"));
            router.refresh();
          });
        }}
      >
        <SettingsSection title={t("retention")}>
          <Field label={t("retentionLabel")} hint={t("retentionHint")} error={errors.retentionMonths ? tx(errors.retentionMonths) : undefined}>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={120} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} className="w-24 tabular-nums" />
              <span className="text-14 text-ink-muted">{t("months")}</span>
            </div>
          </Field>
        </SettingsSection>
        <SettingsSection title={t("contact")}>
          <Field label={t("contactLabel")} qualifier={tx("common.optional")} hint={t("contactHint")} error={errors.privacyContactEmail ? tx(errors.privacyContactEmail) : undefined}>
            <Input type="email" value={contact} onChange={(e) => setContact(e.target.value)} />
          </Field>
        </SettingsSection>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending}>
            {t("save")}
          </Button>
        </div>
      </form>
      <SettingsSection title={t("status")} description={t("automatic")}>
        <ul className="flex flex-col gap-1.5 text-14">
          <li className={due > 0 ? "font-medium text-warning" : undefined}>{t("due", { count: due })}</li>
          <li>{t("upcoming", { count: upcoming })}</li>
          <li className="text-ink-muted">{t("anonymized", { count: anonymized })}</li>
        </ul>
        <Button
          className="self-start"
          disabled={due === 0}
          loading={running}
          onClick={() =>
            startRun(async () => {
              const result = await runRetentionAction();
              if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
              toast(t("ran", { count: result.data.count }));
              router.refresh();
            })
          }
        >
          {t("runNow")}
        </Button>
      </SettingsSection>
      <SettingsSection title={t("rights")}>
        <p className="text-14">{t("rightsBody")}</p>
      </SettingsSection>
    </div>
  );
}
