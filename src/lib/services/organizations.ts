import { and, count, eq, ne } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import {
  emailTemplates,
  files,
  memberships,
  organizations,
  user,
  type Locale,
} from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { env } from "@/lib/env";
import { assertCan } from "@/lib/permissions";
import { defaultTemplates } from "./default-templates";
import { shortId, slugify } from "@/lib/utils/text";
import type { Ctx } from "./types";

/** Organisations of the instance, the demo one excluded. */
export async function realOrganizationCount(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(organizations)
    .where(eq(organizations.isDemo, false));
  return row?.total ?? 0;
}

/** A first organisation can always be created; more only when the instance allows sign-ups. */
export async function canCreateOrganization(): Promise<boolean> {
  return env().ALLOW_SIGNUP || (await realOrganizationCount()) === 0;
}

async function uniqueSlug(tx: Tx, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name, 40);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${shortId(4)}`;
    const clash = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(
        excludeId
          ? and(eq(organizations.slug, slug), ne(organizations.id, excludeId))
          : eq(organizations.slug, slug),
      )
      .limit(1);
    if (clash.length === 0) return slug;
  }
  return `${base}-${shortId(8)}`;
}

export function defaultEmailTemplates(organizationId: string, locale: Locale) {
  return defaultTemplates[locale].map((template) => ({ organizationId, ...template }));
}

export async function createOrganization(
  userId: string,
  input: { name: string; locale: Locale },
  tx?: Tx,
) {
  const run = async (t: Tx) => {
    const slug = await uniqueSlug(t, input.name);
    const [org] = await t
      .insert(organizations)
      .values({ name: input.name.trim(), slug, locale: input.locale })
      .returning();
    if (!org) throw new Error("Organisation not created");
    await t.insert(memberships).values({ organizationId: org.id, userId, role: "admin" });
    await t.insert(emailTemplates).values(defaultEmailTemplates(org.id, input.locale));
    return org;
  };
  return tx ? run(tx) : db.transaction(run);
}

export async function getOrganization(ctx: Ctx) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  if (!org) throw new Error("Organisation not found");
  return org;
}

export type OrganizationUpdate = Partial<{
  name: string;
  slug: string;
  locale: Locale;
  brandColor: string;
  headingFont: "serif" | "sans";
  tagline: string | null;
  descriptionHtml: string;
  websiteUrl: string | null;
  privacyContactEmail: string | null;
  logoKey: string | null;
  coverKey: string | null;
  retentionMonths: number;
  sendConfirmationEmail: boolean;
}>;

export class SlugTakenError extends Error {
  constructor() {
    super("Slug already used");
    this.name = "SlugTakenError";
  }
}

export async function updateOrganization(ctx: Ctx, input: OrganizationUpdate) {
  const privacyOnly = Object.keys(input).every(
    (k) => k === "retentionMonths" || k === "privacyContactEmail",
  );
  assertCan(ctx.role, privacyOnly ? "settings:privacy" : "settings:organization");
  return db.transaction(async (tx) => {
    if (input.slug !== undefined) {
      const slug = slugify(input.slug, 40);
      const clash = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.slug, slug), ne(organizations.id, ctx.orgId)))
        .limit(1);
      if (clash.length > 0) throw new SlugTakenError();
      input = { ...input, slug };
    }
    const [org] = await tx
      .update(organizations)
      .set(input)
      .where(eq(organizations.id, ctx.orgId))
      .returning();
    return org!;
  });
}

/** Public data of an organisation for its career site. */
export async function getPublicOrganization(slug: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug));
  return org ?? null;
}

/** Where an anonymous visitor of `/` should go. */
export async function homeDestination(): Promise<
  { kind: "setup" } | { kind: "careers"; slug: string } | { kind: "login" }
> {
  const rows = await db
    .select({ slug: organizations.slug, isDemo: organizations.isDemo })
    .from(organizations)
    .limit(10);
  const real = rows.filter((r) => !r.isDemo);
  if (real.length === 1) return { kind: "careers", slug: real[0]!.slug };
  if (rows.length === 0) return { kind: "setup" };
  return { kind: "login" };
}

export class NotDemoError extends Error {
  constructor() {
    super("Only the demo organisation can be deleted this way");
    this.name = "NotDemoError";
  }
}

/** Removes the demo organisation, its files and the demo accounts that belong nowhere else. */
export async function deleteDemoOrganization(ctx: Ctx) {
  assertCan(ctx.role, "settings:organization");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  if (!org?.isDemo) throw new NotDemoError();
  const keys = (
    await db.select({ key: files.storageKey }).from(files).where(eq(files.organizationId, org.id))
  ).map((f) => f.key);
  for (const key of [...keys, org.logoKey, org.coverKey])
    if (key)
      await storage()
        .delete(key)
        .catch(() => {});
  const members = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.organizationId, org.id));
  await db.delete(organizations).where(eq(organizations.id, org.id));
  for (const { userId } of members) {
    const [other] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);
    if (!other && userId.startsWith("demo_")) await db.delete(user).where(eq(user.id, userId));
  }
}
