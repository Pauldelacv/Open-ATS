"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Dropzone } from "@/components/ui/dropzone";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { CV_ACCEPT, cvError } from "@/lib/validation/application";

export function ManualCandidateDialog({
  jobId,
  onClose,
  onAdded,
}: {
  jobId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useTranslations("pipeline.manual");
  const ta = useTranslations("careers.apply");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    linkUrl: "",
  });
  const [cv, setCv] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof values, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };
  const err = (k: string) => (errors[k] ? tx(errors[k]!) : undefined);

  const submit = async () => {
    setFormError(null);
    const body = new FormData();
    for (const [k, v] of Object.entries(values)) body.set(k, v);
    if (cv) body.set("cv", cv);
    setPending(true);
    const res = await fetch(`/api/jobs/${jobId}/candidates`, { method: "POST", body });
    const data = (await res.json().catch(() => ({ ok: false, error: "common.unknownError" }))) as {
      ok: boolean;
      error?: string;
      fieldErrors?: Record<string, string>;
    };
    setPending(false);
    if (!data.ok) {
      setErrors(data.fieldErrors ?? {});
      if (data.error && data.error !== "form") setFormError(data.error);
      return;
    }
    toast(t("added"));
    onAdded();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={t("title")}
        description={t("description")}
        closeLabel={tx("common.close")}
      >
        <form
          noValidate
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            {formError ? <Banner tone="danger">{tx(formError)}</Banner> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={ta("firstName")} error={err("firstName")}>
                <Input
                  autoFocus
                  value={values.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                />
              </Field>
              <Field label={ta("lastName")} error={err("lastName")}>
                <Input value={values.lastName} onChange={(e) => set("lastName", e.target.value)} />
              </Field>
            </div>
            <Field label={ta("email")} qualifier={tx("common.optional")} error={err("email")}>
              <Input
                type="email"
                value={values.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={ta("phone")} qualifier={tx("common.optional")}>
                <Input
                  type="tel"
                  value={values.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label={ta("link")} qualifier={tx("common.optional")}>
                <Input value={values.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-13 font-medium">
                {ta("cv")}{" "}
                <span className="font-normal text-ink-muted">{tx("common.optional")}</span>
              </span>
              <Dropzone
                file={cv}
                onFile={(file) => {
                  setCv(file);
                  setErrors((e) => ({ ...e, cv: file ? (cvError(file) ?? "") : "" }));
                }}
                accept={CV_ACCEPT}
                locale={locale}
                error={err("cv")}
                labels={{
                  prompt: ta("cvPrompt"),
                  browse: ta("cvBrowse"),
                  constraints: ta("cvConstraints"),
                  replace: tx("ui.dropzone.replace"),
                  remove: tx("ui.dropzone.remove"),
                }}
              />
              {err("cv") ? <p className="text-13 text-danger">{err("cv")}</p> : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{tx("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
