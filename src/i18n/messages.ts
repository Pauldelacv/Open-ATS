import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import type { AppLocale } from "./config";

export const messages = { fr, en } as const satisfies Record<AppLocale, typeof fr>;

export type Messages = typeof fr;
