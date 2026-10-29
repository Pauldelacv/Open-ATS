import { z } from "zod";

// Messages are translation keys, resolved in the forms.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("auth.errors.email")
  .max(254, "auth.errors.email");
export const passwordSchema = z
  .string()
  .min(10, "auth.errors.password")
  .max(128, "auth.errors.password");
export const nameSchema = z.string().trim().min(1, "auth.errors.name").max(120, "auth.errors.name");

export const setupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  company: z.string().trim().min(1, "auth.errors.company").max(120, "auth.errors.company"),
  locale: z.enum(["fr", "en"]).default("fr"),
});

export const organizationOnlySchema = setupSchema.pick({ company: true, locale: true });

export const inviteSignupSchema = z.object({
  name: nameSchema,
  password: passwordSchema,
});
