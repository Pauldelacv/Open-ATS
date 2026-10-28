import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { instrumentSans } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "Open ATS", template: "%s – Open ATS" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#EEF0EC",
};

export default async function AppRootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("common");
  return (
    <html lang={locale} className={instrumentSans.variable}>
      <body className="min-h-dvh bg-stone">
        <NextIntlClientProvider>
          <TooltipProvider delayDuration={400}>
            {children}
            <Toaster closeLabel={t("close")} />
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
