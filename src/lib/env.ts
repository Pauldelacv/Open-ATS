import { z } from "zod";

const boolish = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("postgres://openats:openats@localhost:5432/openats"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(1).optional(),
  ALLOW_SIGNUP: boolish,
  SEED_DEMO: boolish,
  DATA_DIR: z.string().default("./data"),
  UPLOADS_DIR: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolish,
  SMTP_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: boolish,
  MAIL_FROM: z.string().default("Open ATS <no-reply@localhost>"),
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
