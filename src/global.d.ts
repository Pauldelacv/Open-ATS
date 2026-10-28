import type { AppLocale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: Messages;
  }
}
