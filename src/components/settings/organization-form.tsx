"use client";

import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { deleteDemoAction, saveOrganizationAction } from "@/app/(app)/(backoffice)/settings/actions";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import { Field, Fieldset } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { brandPalette } from "@/lib/brand";
import type { OrganizationInput } from "@/lib/validation/organization";
import { SettingsSection } from "./section";

type Value = {
  name: string;
  slug: string;
  websiteUrl: string;
  locale: "fr" | "en";
  brandColor: string;
  headingFont: "serif" | "sans";
  tagline: string;
  descriptionHtml: string;
  sendConfirmationEmail: boolean;
};

export function OrganizationForm({
  initial,
  logoUrl,
  coverUrl,
  appUrl,
  isDemo,
}: {
  isDemo: boolean;
  initial: Value;
  logoUrl: string | null;
  coverUrl: string | null;
  appUrl: string;
}) {
  const t = useTranslations("settings.organization");
  const tAll = useTranslations();
  const tx = loose(tAll);
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [demoOpen, setDemoOpen] = useState(false);
  const [deletingDemo, startDelete] = useTransition();
  const set = <K extends keyof Value>(key: K, v: Value[K]) => {
    setValue((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };
  const err = (key: string) => (errors[key] ? tx(errors[key]!) : undefined);
  const palette = brandPalette(/^#[0-9a-f]{6}$/i.test(value.brandColor) ? value.brandColor : initial.brandColor);

  const save = () =>
    start(async () => {
      const result = await saveOrganizationAction(value as OrganizationInput);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error !== "form") toast({ message: tx(result.error), tone: "danger" });
        return;
      }
      setErrors({});
      toast(t("saved"));
      router.refresh();
    });

  const richLabels = Object.fromEntries(
    (["toolbar", "bold", "italic", "heading2", "heading3", "bulletList", "orderedList", "link", "linkUrl", "applyLink", "removeLink"] as const).map((k) => [
      k,
      tAll(`ui.richText.${k}`),
    ]),
  ) as Record<"toolbar" | "bold" | "italic" | "heading2" | "heading3" | "bulletList" | "orderedList" | "link" | "linkUrl" | "applyLink" | "removeLink", string>;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-20 font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-14 text-ink-muted">{t("description")}</p>
        </div>
        <Button asChild>
          <a href={`/careers/${initial.slug}`} target="_blank" rel="noopener">
            <ExternalLink aria-hidden="true" />
            {t("preview")}
          </a>
        </Button>
      </div>

      <SettingsSection title={t("identity")}>
        <Field label={t("name")} error={err("name")}>
          <Input value={value.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
        </Field>
        <Field label={t("slug")} hint={t("slugHint")} error={err("slug")}>
          <div className="flex items-stretch">
            <span className="inline-flex items-center rounded-l-sm border border-r-0 border-line-strong bg-stone px-2.5 text-13 text-ink-muted">
              {appUrl.replace(/^https?:\/\//, "")}/careers/
            </span>
            <Input
              value={value.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
              className="rounded-l-none"
              aria-invalid={errors.slug ? true : undefined}
              maxLength={40}
            />
          </div>
        </Field>
        <Field label={t("website")} qualifier={tx("common.optional")} error={err("websiteUrl")}>
          <Input type="url" inputMode="url" value={value.websiteUrl} placeholder={t("websitePlaceholder")} onChange={(e) => set("websiteUrl", e.target.value)} />
        </Field>
        <Field label={t("locale")}>
          <Select value={value.locale} onChange={(e) => set("locale", e.target.value as Value["locale"])}>
            <option value="fr">{tx("common.languages.fr")}</option>
            <option value="en">{tx("common.languages.en")}</option>
          </Select>
        </Field>
      </SettingsSection>

      <SettingsSection title={t("brand")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <ImageField kind="logo" label={t("logo")} hint={t("logoHint")} initialUrl={logoUrl} square />
          <ImageField kind="cover" label={t("cover")} hint={t("coverHint")} initialUrl={coverUrl} />
        </div>
        <Field label={t("color")} hint={t("colorHint")} error={err("brandColor")}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label={t("color")}
              value={/^#[0-9a-f]{6}$/i.test(value.brandColor) ? value.brandColor : "#2447d6"}
              onChange={(e) => set("brandColor", e.target.value.toUpperCase())}
              className="h-8 w-10 cursor-pointer rounded-sm border border-line-strong bg-paper p-0.5"
            />
            <Input value={value.brandColor} onChange={(e) => set("brandColor", e.target.value)} className="w-32 tabular-nums" maxLength={7} />
            <span
              className="ml-2 inline-flex h-8 items-center rounded-sm px-3 text-14 font-medium"
              style={{ background: palette.brand, color: palette.brandFg }}
              aria-hidden="true"
            >
              {tx("careers.job.applyToJob")}
            </span>
          </div>
        </Field>
        <Fieldset legend={t("headingFont")}>
          <div className="flex flex-wrap gap-6">
            <Radio
              id="font-serif"
              name="headingFont"
              checked={value.headingFont === "serif"}
              onChange={() => set("headingFont", "serif")}
              label={<span className="font-serif-preview text-20">{t("fontSerif")}</span>}
            />
            <Radio
              id="font-sans"
              name="headingFont"
              checked={value.headingFont === "sans"}
              onChange={() => set("headingFont", "sans")}
              label={<span className="text-20 font-semibold">{t("fontSans")}</span>}
            />
          </div>
        </Fieldset>
      </SettingsSection>

      <SettingsSection title={t("presentation")}>
        <Field label={t("tagline")} qualifier={tx("common.optional")} hint={t("taglineHint", { company: value.name })} error={err("tagline")}>
          <Input value={value.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={120} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-13 font-medium">{t("descriptionLabel")}</span>
          <RichTextEditor
            value={value.descriptionHtml}
            onChange={(html) => set("descriptionHtml", html)}
            labels={richLabels}
            placeholder={t("descriptionPlaceholder")}
          />
        </div>
        <Checkbox
          id="send-confirmation"
          checked={value.sendConfirmationEmail}
          onChange={(e) => set("sendConfirmationEmail", e.target.checked)}
          label={t("confirmation")}
          hint={t("confirmationHint")}
        />
      </SettingsSection>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          {tx("common.save")}
        </Button>
      </div>

      {isDemo ? (
        <SettingsSection title={t("demoTitle")}>
          <p className="text-14">{t("demoBody")}</p>
          <Button variant="danger" className="self-start" onClick={() => setDemoOpen(true)}>
            {t("demoDelete")}
          </Button>
          <Dialog open={demoOpen} onOpenChange={setDemoOpen}>
            <DialogContent width="sm" title={t("demoConfirmTitle")} closeLabel={tx("common.close")}>
              <DialogBody>
                <p className="text-14">{t("demoConfirmBody")}</p>
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{tx("common.cancel")}</Button>
                </DialogClose>
                <Button
                  variant="danger"
                  loading={deletingDemo}
                  onClick={() =>
                    startDelete(async () => {
                      const result = await deleteDemoAction();
                      if (result && !result.ok) toast({ message: tx(result.error), tone: "danger" });
                    })
                  }
                >
                  {t("demoDelete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SettingsSection>
      ) : null}
    </form>
  );
}

function ImageField({
  kind,
  label,
  hint,
  initialUrl,
  square,
}: {
  kind: "logo" | "cover";
  label: string;
  hint: string;
  initialUrl: string | null;
  square?: boolean;
}) {
  const t = useTranslations("settings.organization");
  const tx = loose(useTranslations());
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(`/api/settings/assets?kind=${kind}`, { method: "POST", body });
    const data = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string; error?: string };
    setBusy(false);
    if (!data.ok || !data.url) {
      setError(data.error ?? "settings.organization.errors.image");
      return;
    }
    setUrl(data.url);
    router.refresh();
  };

  const remove = async () => {
    setBusy(true);
    await fetch(`/api/settings/assets?kind=${kind}`, { method: "DELETE" });
    setBusy(false);
    setUrl(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-13 font-medium">{label}</span>
      <div className="flex items-center gap-3">
        <div
          className={
            square
              ? "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-stone"
              : "flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-stone"
          }
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className={square ? "size-full object-contain" : "size-full object-cover"} />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" loading={busy} onClick={() => input.current?.click()}>
            {busy ? t("uploading") : url ? t("replace") : t("upload")}
          </Button>
          {url ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>
              {t("remove")}
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="text-13 text-danger" role="alert">
          {tx(error)}
        </p>
      ) : (
        <p className="text-13 text-ink-muted">{hint}</p>
      )}
    </div>
  );
}
