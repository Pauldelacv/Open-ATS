import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthPanel } from "@/components/app/auth-panel";
import { getSession } from "@/lib/context";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo/constants";
import { env, smtpConfigured } from "@/lib/env";
import { canCreateOrganization } from "@/lib/services/organizations";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/jobs";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  if (await getSession()) redirect(next);
  const t = await getTranslations("auth");
  const setupOpen = await canCreateOrganization();
  const demo = env().SEED_DEMO;
  return (
    <div className="flex flex-col gap-4">
      <AuthPanel title={t("login.title")} subtitle={t("login.subtitle")}>
        <LoginForm
          next={next}
          initialEmail={typeof params.email === "string" ? params.email : ""}
          magicLinkError={params.error === "magic"}
          smtpConfigured={smtpConfigured()}
          demo={demo ? { email: DEMO_EMAIL, password: DEMO_PASSWORD } : null}
        />
      </AuthPanel>
      <p className="px-1 text-13 text-ink-muted">
        {setupOpen ? (
          <>
            {t("login.firstSetup")}{" "}
            <Link href="/setup" className="font-medium text-cobalt hover:underline">
              {t("login.firstSetupLink")}
            </Link>
          </>
        ) : (
          t("login.noAccount")
        )}
      </p>
    </div>
  );
}
