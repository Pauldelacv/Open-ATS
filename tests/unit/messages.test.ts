import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("message catalogues", () => {
  it("have the same keys in French and English", () => {
    expect(keys(en).sort()).toEqual(keys(fr).sort());
  });

  it.each([
    ["fr", fr],
    ["en", en],
  ] as const)("every %s message is valid ICU and formats with sample values", (locale, messages) => {
    const t = createTranslator({ locale, messages, timeZone: "Europe/Paris" }) as unknown as {
      (key: string, values?: Record<string, unknown>): string;
      rich: (key: string, values?: Record<string, unknown>) => unknown;
    };
    const sample = new Proxy({}, { get: (_target, prop) => (prop === "count" || prop === "value" || prop === "months" || prop === "days" || prop === "index" || prop === "total" || prop === "page" ? 2 : "x") });
    for (const key of keys(messages)) {
      const raw = key.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], messages) as string;
      const values = Object.fromEntries([...raw.matchAll(/\{(\w+)/g)].map((m) => [m[1]!, (sample as Record<string, unknown>)[m[1]!]]));
      if (/<\w+>/.test(raw)) {
        expect(() => t.rich(key, { ...values, link: (c: unknown) => c })).not.toThrow();
      } else {
        expect(() => t(key, values), key).not.toThrow();
        expect(t(key, values), key).not.toContain("MISSING_MESSAGE");
      }
    }
  });

  it("contain no exclamation mark and no emoji", () => {
    for (const key of keys(fr)) {
      const raw = key.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], fr) as string;
      expect(raw, key).not.toMatch(/!/);
      expect(raw, key).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
