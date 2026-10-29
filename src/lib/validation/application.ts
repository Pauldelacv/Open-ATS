import { z } from "zod";
import type { QuestionType } from "@/lib/db/schema";

export const MAX_CV_BYTES = 10 * 1024 * 1024;

export const CV_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export const CV_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type CvKind = keyof typeof CV_MIME;

export function cvKind(file: { name: string; type: string }): CvKind | null {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "pdf" || file.type === CV_MIME.pdf) return "pdf";
  if (ext === "docx" || file.type === CV_MIME.docx) return "docx";
  return null;
}

/** Returns a message key when the file is not acceptable. */
export function cvError(file: { name: string; type: string; size: number } | null): string | null {
  if (!file) return "careers.errors.cvMissing";
  if (!cvKind(file) || file.size > MAX_CV_BYTES || file.size === 0)
    return "careers.errors.cvInvalid";
  return null;
}

/** Checks the first bytes so that a renamed file is not accepted as a CV. */
export function cvSignatureMatches(kind: CvKind, bytes: Uint8Array): boolean {
  if (kind === "pdf")
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  return bytes[0] === 0x50 && bytes[1] === 0x4b; // PK (zip container)
}

const phone = z
  .string()
  .trim()
  .max(40, "careers.errors.phone")
  .refine(
    (v) => v === "" || (/^[+()\d\s.\-]+$/.test(v) && v.replace(/\D/g, "").length >= 6),
    "careers.errors.phone",
  );

const link = z
  .string()
  .trim()
  .max(500, "careers.errors.link")
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .refine((v) => {
    if (!v) return true;
    try {
      const url = new URL(v);
      return url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "careers.errors.link");

export type PublicQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  options: string[];
  required: boolean;
};

export function applicationSchema(questions: PublicQuestion[]) {
  const answers: Record<string, z.ZodType<string>> = {};
  for (const q of questions) {
    let field = z
      .string()
      .trim()
      .max(q.type === "long_text" ? 5000 : 500, "careers.errors.tooLong");
    if (q.type === "yes_no")
      field = field.refine((v) => v === "" || v === "yes" || v === "no", "careers.errors.answer");
    if (q.type === "single_choice")
      field = field.refine((v) => v === "" || q.options.includes(v), "careers.errors.answer");
    answers[q.id] = q.required
      ? field.refine((v) => v.length > 0, "careers.errors.answerRequired")
      : field;
  }
  return z.object({
    firstName: z
      .string()
      .trim()
      .min(1, "careers.errors.firstName")
      .max(80, "careers.errors.tooLong"),
    lastName: z.string().trim().min(1, "careers.errors.lastName").max(80, "careers.errors.tooLong"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("careers.errors.email")
      .max(254, "careers.errors.email"),
    phone: phone.default(""),
    link: link.default(""),
    message: z.string().trim().max(5000, "careers.errors.tooLong").default(""),
    answers: z.object(answers),
    consent: z.literal(true, { error: "careers.errors.consent" }),
  });
}

export type ApplicationData = z.output<ReturnType<typeof applicationSchema>>;
