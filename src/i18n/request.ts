import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, timeZone } from "./config";
import { messages } from "./messages";

export default getRequestConfig(async ({ locale: explicit }) => {
  let locale = isLocale(explicit) ? explicit : undefined;
  if (!locale) {
    const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
    locale = isLocale(cookieLocale)
      ? cookieLocale
      : (localeFromAcceptLanguage((await headers()).get("accept-language")) ?? defaultLocale);
  }
  return { locale, messages: messages[locale], timeZone: timeZone() };
});
