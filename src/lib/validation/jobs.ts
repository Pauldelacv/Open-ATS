import { z } from "zod";

export const contractTypes = ["cdi", "cdd", "freelance", "apprenticeship", "internship"] as const;
export const remotePolicies = ["onsite", "hybrid", "remote"] as const;
export const salaryPeriods = ["year", "month", "day", "hour"] as const;
export const questionTypes = ["short_text", "long_text", "yes_no", "single_choice"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "jobs.errors.tooLong")
    .optional()
    .transform((v) => (v ? v : null));

const optionalAmount = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[\s  ]/g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100_000_000) {
      ctx.addIssue({ code: "custom", message: "jobs.errors.salary" });
      return z.NEVER;
    }
    return Math.round(n);
  });

export const questionSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1, "jobs.errors.questionLabel").max(300, "jobs.errors.tooLong"),
    type: z.enum(questionTypes),
    options: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    required: z.boolean().default(false),
  })
  .superRefine((q, ctx) => {
    if (q.type === "single_choice" && q.options.filter(Boolean).length < 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "jobs.errors.options" });
    }
  });

export const jobInputSchema = z
  .object({
    title: z.string().trim().min(1, "jobs.errors.title").max(150, "jobs.errors.tooLong"),
    descriptionHtml: z.string().max(100_000).default(""),
    department: optionalText(80),
    location: optionalText(120),
    remote: z.enum(remotePolicies).default("onsite"),
    contract: z.enum(contractTypes).default("cdi"),
    salaryMin: optionalAmount,
    salaryMax: optionalAmount,
    salaryCurrency: z.string().trim().length(3).default("EUR"),
    salaryPeriod: z.enum(salaryPeriods).default("year"),
    questions: z.array(questionSchema).max(20).default([]),
    memberIds: z.array(z.string()).max(50).default([]),
  })
  .superRefine((job, ctx) => {
    if (job.salaryMin !== null && job.salaryMax !== null && job.salaryMax < job.salaryMin) {
      ctx.addIssue({ code: "custom", path: ["salaryMax"], message: "jobs.errors.salaryRange" });
    }
  });

export type JobInput = z.input<typeof jobInputSchema>;
export type JobData = z.output<typeof jobInputSchema>;
