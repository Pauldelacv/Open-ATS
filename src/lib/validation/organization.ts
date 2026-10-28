import { z } from "zod";

const url = z
  .string()
  .trim()
  .max(300, "settings.organization.errors.tooLong")
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .refine((v) => {
    if (!v) return true;
    try {
      return new URL(v).hostname.includes(".");
    } catch {
      return false;
    }
  }, "settings.organization.errors.url")
  .transform((v) => v || null);

export const organizationSchema = z.object({
  name: z.string().trim().min(1, "settings.organization.errors.name").max(120, "settings.organization.errors.tooLong"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "settings.organization.errors.slug"),
  websiteUrl: url,
  locale: z.enum(["fr", "en"]),
  brandColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "settings.organization.errors.color"),
  headingFont: z.enum(["serif", "sans"]),
  tagline: z
    .string()
    .trim()
    .max(120, "settings.organization.errors.tooLong")
    .transform((v) => v || null),
  descriptionHtml: z.string().max(50_000, "settings.organization.errors.tooLong"),
  sendConfirmationEmail: z.boolean(),
});

export type OrganizationInput = z.input<typeof organizationSchema>;

export const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Uint8Array) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": {
    ext: "webp",
    magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  "image/svg+xml": {
    ext: "svg",
    magic: (b) => {
      const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
      return (head.startsWith("<svg") || head.startsWith("<?xml")) && !head.includes("<script");
    },
  },
};

export const ASSET_LIMITS = { logo: 2 * 1024 * 1024, cover: 5 * 1024 * 1024 } as const;
