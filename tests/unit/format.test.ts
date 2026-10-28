import { describe, expect, it } from "vitest";
import { formatRelative, formatSalary } from "@/lib/format";
import { retentionCutoff } from "@/lib/services/gdpr";

describe("formatting", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  it("uses relative dates under a week, full dates beyond", () => {
    expect(formatRelative(new Date("2026-10-26T12:00:00Z"), "fr", now)).toBe("avant-hier");
    expect(formatRelative(new Date("2026-10-28T11:59:40Z"), "fr", now)).toBe("à l'instant");
    expect(formatRelative(new Date("2026-03-12T12:00:00Z"), "fr", now)).toBe("12 mars");
    expect(formatRelative(new Date("2025-03-12T12:00:00Z"), "fr", now)).toBe("12 mars 2025");
  });
  it("formats salary ranges", () => {
    const labels = { period: "par an", from: "À partir de", upTo: "Jusqu'à" };
    const base = { salaryCurrency: "EUR", salaryPeriod: "year" as const };
    expect(formatSalary({ ...base, salaryMin: 45000, salaryMax: 55000 }, "fr", labels)).toMatch(/^45\s000\s€ – 55\s000\s€ par an$/u);
    expect(formatSalary({ ...base, salaryMin: 45000, salaryMax: null }, "fr", labels)).toMatch(/^À partir de 45\s000\s€ par an$/u);
    expect(formatSalary({ ...base, salaryMin: null, salaryMax: null }, "fr", labels)).toBeNull();
  });
  it("computes the retention cutoff in months", () => {
    expect(retentionCutoff(24, new Date("2026-10-28T00:00:00Z")).toISOString()).toBe("2024-10-28T00:00:00.000Z");
  });
});
