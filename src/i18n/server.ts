import { createTranslator } from "next-intl";
import { timeZone, type AppLocale } from "./config";
import { messages } from "./messages";

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

/** Translator usable outside React (emails, route handlers, background jobs). */
export function serverTranslator(locale: AppLocale, namespace: string): Translate {
  const t = createTranslator({
    locale,
    messages: messages[locale],
    timeZone: timeZone(),
    namespace: namespace as never,
  });
  return t as unknown as Translate;
}
