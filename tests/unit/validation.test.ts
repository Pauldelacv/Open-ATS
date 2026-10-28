import { describe, expect, it } from "vitest";
import { applicationSchema, cvError, cvSignatureMatches } from "@/lib/validation/application";
import { jobInputSchema } from "@/lib/validation/jobs";

describe("application form", () => {
  const questions = [
    { id: "q1", label: "Disponibilité", type: "single_choice" as const, options: ["Immédiate", "Un mois"], required: true },
    { id: "q2", label: "Permis ?", type: "yes_no" as const, options: [], required: false },
  ];
  const valid = {
    firstName: "Marion",
    lastName: "Lefort",
    email: "Marion@Example.com ",
    phone: "06 12 34 56 78",
    link: "linkedin.com/in/marion",
    message: "",
    answers: { q1: "Un mois", q2: "" },
    consent: true,
  };

  it("accepts a complete application and normalises fields", () => {
    const result = applicationSchema(questions).parse(valid);
    expect(result.email).toBe("marion@example.com");
    expect(result.link).toBe("https://linkedin.com/in/marion");
  });
  it("requires consent and required answers", () => {
    const result = applicationSchema(questions).safeParse({ ...valid, consent: false, answers: { q1: "", q2: "" } });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toContain("consent");
    expect(paths).toContain("answers.q1");
  });
  it("rejects answers outside the proposed choices", () => {
    expect(applicationSchema(questions).safeParse({ ...valid, answers: { q1: "Demain", q2: "" } }).success).toBe(false);
  });
  it("rejects bad phone numbers and emails with readable keys", () => {
    const result = applicationSchema(questions).safeParse({ ...valid, phone: "abc", email: "marion@" });
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toContain("careers.errors.phone");
    expect(messages).toContain("careers.errors.email");
  });
});

describe("CV files", () => {
  it("accepts PDF and DOCX up to 10 MB", () => {
    expect(cvError({ name: "cv.pdf", type: "application/pdf", size: 1000 })).toBeNull();
    expect(cvError({ name: "CV.DOCX", type: "", size: 1000 })).toBeNull();
    expect(cvError({ name: "cv.png", type: "image/png", size: 1000 })).toBe("careers.errors.cvInvalid");
    expect(cvError({ name: "cv.pdf", type: "application/pdf", size: 11 * 1024 * 1024 })).toBe("careers.errors.cvInvalid");
    expect(cvError(null)).toBe("careers.errors.cvMissing");
  });
  it("checks file signatures", () => {
    expect(cvSignatureMatches("pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(cvSignatureMatches("pdf", new TextEncoder().encode("<html>"))).toBe(false);
    expect(cvSignatureMatches("docx", new Uint8Array([0x50, 0x4b, 3, 4]))).toBe(true);
  });
});

describe("job form", () => {
  it("parses salaries written the French way", () => {
    const job = jobInputSchema.parse({ title: "Ébéniste", salaryMin: "45 000", salaryMax: "55000" });
    expect(job.salaryMin).toBe(45000);
    expect(job.salaryMax).toBe(55000);
  });
  it("refuses an inverted salary range and single-choice questions without options", () => {
    const result = jobInputSchema.safeParse({
      title: "Ébéniste",
      salaryMin: 50000,
      salaryMax: 40000,
      questions: [{ label: "Choix", type: "single_choice", options: ["Un"], required: true }],
    });
    const messages = result.error!.issues.map((i) => i.message);
    expect(messages).toContain("jobs.errors.salaryRange");
    expect(messages).toContain("jobs.errors.options");
  });
});
