import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailMessages, invitations, memberships, organizations, user, type Role } from "@/lib/db/schema";
import { appUrl } from "@/lib/env";
import { serverTranslator } from "@/i18n/server";
import { deliver, textToHtml } from "@/lib/mail";
import { assertCan, NotFoundError } from "@/lib/permissions";
import { randomToken, sha256 } from "@/lib/utils/crypto";
import type { Ctx } from "./types";

const INVITATION_DAYS = 14;

export async function listMembers(ctx: Ctx) {
  return db
    .select({
      membershipId: memberships.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.organizationId, ctx.orgId))
    .orderBy(asc(user.name));
}

export async function listPendingInvitations(ctx: Ctx) {
  assertCan(ctx.role, "settings:team");
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, ctx.orgId),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitations.createdAt));
}

export class AlreadyMemberError extends Error {
  constructor() {
    super("Already a member");
    this.name = "AlreadyMemberError";
  }
}

/** Creates (or renews) an invitation and emails it. Returns the link so admins can copy it. */
export async function inviteMember(ctx: Ctx, input: { email: string; role: Role }) {
  assertCan(ctx.role, "settings:team");
  const email = input.email.trim().toLowerCase();
  const existing = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.organizationId, ctx.orgId), eq(user.email, email)))
    .limit(1);
  if (existing.length > 0) throw new AlreadyMemberError();

  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 3600 * 1000);
  await db.transaction(async (tx) => {
    await tx
      .delete(invitations)
      .where(and(eq(invitations.organizationId, ctx.orgId), eq(invitations.email, email), isNull(invitations.acceptedAt)));
    await tx.insert(invitations).values({
      organizationId: ctx.orgId,
      email,
      role: input.role,
      tokenHash: sha256(token),
      invitedById: ctx.userId,
      expiresAt,
    });
  });

  const link = appUrl(`/invite/${token}`);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const [inviter] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.userId));
  const t = serverTranslator(org!.locale, "emails.invitation");
  const subject = t("subject", { organization: org!.name });
  const text = t("body", { inviter: inviter?.name ?? "", organization: org!.name, url: link, days: INVITATION_DAYS });
  const result = await deliver({ to: email, subject, text, html: textToHtml(text), fromName: org!.name });
  await db.insert(emailMessages).values({
    organizationId: ctx.orgId,
    category: "team",
    toEmail: email,
    subject,
    body: text,
    status: result.status,
    error: result.error,
    sentById: ctx.userId,
  });
  return { link, delivery: result.status };
}

export async function revokeInvitation(ctx: Ctx, invitationId: string) {
  assertCan(ctx.role, "settings:team");
  await db
    .delete(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.organizationId, ctx.orgId)));
}

/** Public lookup used by the invitation page. */
export async function findInvitation(token: string) {
  const [row] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      organizationId: invitations.organizationId,
      organizationName: organizations.name,
      organizationLocale: organizations.locale,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(eq(invitations.tokenHash, sha256(token)));
  if (!row) return null;
  const valid = !row.acceptedAt && row.expiresAt > new Date();
  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, row.email));
  return { ...row, valid, hasAccount: Boolean(existingUser) };
}

export class InvitationError extends Error {
  constructor(public readonly reason: "invalid" | "email_mismatch") {
    super(`Invitation ${reason}`);
    this.name = "InvitationError";
  }
}

export async function acceptInvitation(token: string, account: { id: string; email: string }) {
  const invitation = await findInvitation(token);
  if (!invitation || !invitation.valid) throw new InvitationError("invalid");
  if (invitation.email !== account.email.toLowerCase()) throw new InvitationError("email_mismatch");
  await db.transaction(async (tx) => {
    await tx
      .insert(memberships)
      .values({ organizationId: invitation.organizationId, userId: account.id, role: invitation.role })
      .onConflictDoNothing();
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, invitation.id));
  });
  return invitation.organizationId;
}

async function adminCount(orgId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(memberships)
    .where(and(eq(memberships.organizationId, orgId), eq(memberships.role, "admin")));
  return row?.total ?? 0;
}

export class LastAdminError extends Error {
  constructor() {
    super("An organisation needs at least one admin");
    this.name = "LastAdminError";
  }
}

export async function changeRole(ctx: Ctx, membershipId: string, role: Role) {
  assertCan(ctx.role, "settings:team");
  const [target] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.orgId)));
  if (!target) throw new NotFoundError("Membership");
  if (target.role === "admin" && role !== "admin" && (await adminCount(ctx.orgId)) <= 1) {
    throw new LastAdminError();
  }
  await db.update(memberships).set({ role }).where(eq(memberships.id, target.id));
}

export async function removeMember(ctx: Ctx, membershipId: string) {
  const [target] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.orgId)));
  if (!target) throw new NotFoundError("Membership");
  if (target.userId !== ctx.userId) assertCan(ctx.role, "settings:team");
  if (target.role === "admin" && (await adminCount(ctx.orgId)) <= 1) throw new LastAdminError();
  await db.delete(memberships).where(eq(memberships.id, target.id));
}
