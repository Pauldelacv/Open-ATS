import type { CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { timeZone } from "@/i18n/config";
import { getMessages } from "next-intl/server";
import { getCareerOrganization } from "@/lib/careers";
import { cn } from "@/lib/cn";
import { appUrl } from "@/lib/env";
import { instrumentSans, instrumentSerif } from "../../../fonts";
import "../../../globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: LayoutProps<"/careers/[org]">): Promise<Metadata> {
  const { org: slug } = await params;
  const org = await getCareerOrganization(slug);
  if (!org) return {};
  return {
    metadataBase: new URL(appUrl("/")),
    title: { default: org.name, template: `%s – ${org.name}` },
    icons: org.logoUrl ? { icon: org.logoUrl } : undefined,
    robots: org.isDemo ? { index: false, follow: false } : { index: true, follow: true },
  };
}

export async function generateViewport({
  params,
}: LayoutProps<"/careers/[org]">): Promise<Viewport> {
  const { org: slug } = await params;
  const org = await getCareerOrganization(slug);
  return { themeColor: org?.palette.brand ?? "#2447D6" };
}

export default async function CareersRootLayout({
  children,
  params,
}: LayoutProps<"/careers/[org]">) {
  const { org: slug } = await params;
  const org = await getCareerOrganization(slug);
  if (!org) notFound();
  const messages = await getMessages({ locale: org.locale });
  const style = {
    "--brand": org.palette.brand,
    "--brand-hover": org.palette.brandHover,
    "--brand-fg": org.palette.brandFg,
    "--brand-link": org.palette.brandLink,
    "--heading-font":
      org.headingFont === "sans" ? "var(--font-instrument-sans)" : "var(--font-instrument-serif)",
  } as CSSProperties;
  return (
    <html
      lang={org.locale}
      className={cn(instrumentSans.variable, instrumentSerif.variable)}
      style={style}
    >
      <body className="flex min-h-dvh flex-col bg-paper text-ink">
        <NextIntlClientProvider locale={org.locale} messages={messages} timeZone={timeZone()}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
