import { z } from "zod";

/** Compose passes unset variables as empty strings: treat them as absent. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const boolish = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.preprocess(
    (v) => v || undefined,
    z.string().min(1).default("postgres://openats:openats@localhost:5432/openats"),
  ),
  APP_URL: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/\/+$/, "") : v) || undefined,
    z.string().url().default("http://localhost:3000"),
  ),
  AUTH_SECRET: optional(z.string().min(1)),
  ALLOW_SIGNUP: boolish,
  SEED_DEMO: boolish,
  DATA_DIR: z.preprocess((v) => v || undefined, z.string().default("./data")),
  UPLOADS_DIR: optional(z.string()),
  STORAGE_DRIVER: z.preprocess((v) => v || undefined, z.enum(["local", "s3"]).default("local")),
  S3_BUCKET: optional(z.string()),
  S3_REGION: optional(z.string()),
  S3_ENDPOINT: optional(z.string()),
  S3_ACCESS_KEY_ID: optional(z.string()),
  S3_SECRET_ACCESS_KEY: optional(z.string()),
  S3_FORCE_PATH_STYLE: boolish,
  SMTP_URL: optional(z.string()),
  SMTP_HOST: optional(z.string()),
  SMTP_PORT: optional(z.coerce.number()),
  SMTP_USER: optional(z.string()),
  SMTP_PASSWORD: optional(z.string()),
  SMTP_SECURE: boolish,
  MAIL_FROM: z.preprocess(
    (v) => v || undefined,
    z.string().default("Open ATS <no-reply@localhost>"),
  ),
  // Shared mailbox read over IMAP for candidates' replies.
  IMAP_HOST: optional(z.string()),
  IMAP_PORT: optional(z.coerce.number().int().positive()),
  IMAP_SECURE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  IMAP_USER: optional(z.string()),
  IMAP_PASSWORD: optional(z.string()),
  IMAP_MAILBOX: z.preprocess((v) => v || undefined, z.string().default("INBOX")),
  IMAP_POLL_SECONDS: z.preprocess(
    (v) => v || undefined,
    z.coerce.number().int().min(10).default(60),
  ),
  // Address candidates reply to; the IMAP user when it is an address.
  MAIL_REPLY_TO: optional(z.string()),
  RETENTION_JOB: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  RUN_MIGRATIONS: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed environment. Read lazily so that `next build` works without runtime variables. */
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

export function appUrl(path = "/"): string {
  return new URL(path, env().APP_URL).toString();
}

export function uploadsDir(): string {
  return env().UPLOADS_DIR ?? `${env().DATA_DIR.replace(/\/$/, "")}/uploads`;
}

export function smtpConfigured(): boolean {
  const e = env();
  return Boolean(e.SMTP_URL || e.SMTP_HOST);
}

export function imapConfigured(): boolean {
  const e = env();
  return Boolean(e.IMAP_HOST && e.IMAP_USER && e.IMAP_PASSWORD);
}

/** Mailbox candidates reply to, when replies are read by Open ATS. */
export function replyMailbox(): string | null {
  if (!imapConfigured()) return null;
  const e = env();
  if (e.MAIL_REPLY_TO) return e.MAIL_REPLY_TO;
  return e.IMAP_USER?.includes("@") ? e.IMAP_USER : null;
}
