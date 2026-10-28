"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loose } from "@/i18n/loose";
import { authClient } from "@/lib/auth/client";
import { inviteSignupSchema } from "@/lib/validation/auth";
import { acceptInvitationAction, joinWithInvitation } from "./actions";

export function InviteSignupForm({ token, email }: { token: string; email: string }) {
  const t = useTranslations();
  const tx = loose(t);
  const [state, action, pending] = useActionState(joinWithInvitation.bind(null, token), null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const serverErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const err = (name: "name" | "password") => {
    const key = errors[name] ?? serverErrors[name];
    return key ? tx(key) : undefined;
  };
  const validate = (name: "name" | "password", value: string) => {
    const r = inviteSignupSchema.shape[name].safeParse(value);
    setErrors((p) => ({ ...p, [name]: r.success ? undefined : r.error.issues[0]?.message }));
  };
  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state && !state.ok && state.error !== "form" ? <Banner tone="danger">{tx(state.error)}</Banner> : null}
      <Field label={t("auth.invite.email")}>
        <Input value={email} readOnly disabled />
      </Field>
      <Field label={t("auth.invite.name")} error={err("name")}>
        <Input name="name" autoComplete="name" autoFocus onBlur={(e) => validate("name", e.target.value)} />
      </Field>
      <Field label={t("auth.invite.password")} hint={t("auth.setup.passwordHint")} error={err("password")}>
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          onBlur={(e) => e.target.value && validate("password", e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" loading={pending} className="mt-1 w-full">
        {t("auth.invite.submit")}
      </Button>
    </form>
  );
}

export function AcceptInvitation({ token }: { token: string }) {
  const t = useTranslations();
  const tx = loose(t);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {error ? <Banner tone="danger">{tx(error)}</Banner> : null}
      <Button
        variant="primary"
        loading={pending}
        className="w-full"
        onClick={() =>
          start(async () => {
            const result = await acceptInvitationAction(token);
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        {t("auth.invite.accept")}
      </Button>
    </div>
  );
}

export function SignOutButton({ label, next }: { label: string; next: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="mt-4"
      loading={pending}
      onClick={() =>
        start(async () => {
          await authClient.signOut();
          router.replace(`/login?next=${encodeURIComponent(next)}`);
          router.refresh();
        })
      }
    >
      {label}
    </Button>
  );
}
