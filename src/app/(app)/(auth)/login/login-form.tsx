"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loose } from "@/i18n/loose";
import { authClient } from "@/lib/auth/client";
import { emailSchema } from "@/lib/validation/auth";

type Props = {
  next: string;
  initialEmail: string;
  magicLinkError: boolean;
  smtpConfigured: boolean;
  demo: { email: string; password: string } | null;
};

export function LoginForm({ next, initialEmail, magicLinkError, smtpConfigured, demo }: Props) {
  const t = useTranslations();
  const tx = loose(t);
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(
    magicLinkError ? "auth.login.magicLinkError" : null,
  );
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const validateEmail = () => {
    const result = emailSchema.safeParse(email);
    setEmailError(result.success ? null : (result.error.issues[0]?.message ?? "auth.errors.email"));
    return result.success ? result.data : null;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const valid = validateEmail();
    if (!valid) return;
    setPending(true);
    if (mode === "password") {
      const { error } = await authClient.signIn.email({ email: valid, password });
      if (error) {
        setPending(false);
        setFormError(
          error.status === 429 ? "auth.errors.rateLimited" : "auth.login.invalidCredentials",
        );
        return;
      }
      router.replace(next);
      router.refresh();
      return;
    }
    const { error } = await authClient.signIn.magicLink({
      email: valid,
      callbackURL: next,
      errorCallbackURL: "/login?error=magic",
    });
    setPending(false);
    if (error && error.status === 429) {
      setFormError("auth.errors.rateLimited");
      return;
    }
    // Same answer whether or not the account exists.
    setSentTo(valid);
  };

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <Banner title={t("auth.login.magicLinkSentTitle")}>
          {t("auth.login.magicLinkSent", { email: sentTo })}
        </Banner>
        {!smtpConfigured ? (
          <p className="text-13 text-ink-muted">{t("auth.login.magicLinkNoSmtp")}</p>
        ) : null}
        <Button variant="link" className="self-start" onClick={() => setSentTo(null)}>
          {t("common.back")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? <Banner tone="danger">{tx(formError)}</Banner> : null}
      <Field label={t("auth.login.email")} error={emailError ? tx(emailError) : undefined}>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoFocus={!initialEmail}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          onBlur={() => email && validateEmail()}
        />
      </Field>
      {mode === "password" ? (
        <Field label={t("auth.login.password")}>
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus={Boolean(initialEmail)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      ) : (
        <p className="-mt-1 text-13 text-ink-muted">{t("auth.login.magicLinkHint")}</p>
      )}
      <Button type="submit" variant="primary" loading={pending} className="w-full">
        {mode === "password" ? t("auth.login.submit") : t("auth.login.magicLinkSubmit")}
      </Button>
      <Button
        variant="ghost"
        className="w-full"
        onClick={() => {
          setMode(mode === "password" ? "magic" : "password");
          setFormError(null);
        }}
      >
        {mode === "password" ? t("auth.login.useMagicLink") : t("auth.login.usePassword")}
      </Button>
      {demo ? (
        <div className="mt-2 flex items-start justify-between gap-3 rounded-md border border-line bg-stone px-3 py-2.5">
          <div className="text-13">
            <p className="font-medium text-ink">{t("auth.login.demoTitle")}</p>
            <p className="mt-0.5 text-ink-muted">
              {t("auth.login.demoBody", { email: demo.email, password: demo.password })}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setMode("password");
              setEmail(demo.email);
              setPassword(demo.password);
              setEmailError(null);
            }}
          >
            {t("auth.login.demoFill")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
