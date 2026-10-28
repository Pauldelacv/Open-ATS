"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { fail, failFrom, fieldErrorsFrom, ok, type ActionResult } from "@/lib/actions";
import { getAuth } from "@/lib/auth";
import { requireContext } from "@/lib/context";
import { db } from "@/lib/db";
import { user, type Role } from "@/lib/db/schema";
import { LOCALE_COOKIE } from "@/i18n/config";
import { sanitizeRichText } from "@/lib/sanitize";
import { SlugTakenError, updateOrganization } from "@/lib/services/organizations";
import { AlreadyMemberError, changeRole, inviteMember, LastAdminError, removeMember, revokeInvitation } from "@/lib/services/team";
import { emailSchema, nameSchema, passwordSchema } from "@/lib/validation/auth";
import { organizationSchema, type OrganizationInput } from "@/lib/validation/organization";
import { z } from "zod";

export async function saveOrganizationAction(input: OrganizationInput): Promise<ActionResult> {
  const ctx = await requireContext();
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) return fail("form", fieldErrorsFrom(parsed.error.issues));
  try {
    await updateOrganization(ctx, { ...parsed.data, descriptionHtml: sanitizeRichText(parsed.data.descriptionHtml) });
  } catch (error) {
    if (error instanceof SlugTakenError) return fail("form", { slug: "settings.organization.slugTaken" });
    return failFrom(error);
  }
  revalidatePath("/", "layout");
  return ok();
}

const roleSchema = z.enum(["admin", "recruiter", "member"]);

export async function inviteMemberAction(input: { email: string; role: Role }): Promise<ActionResult<{ link: string; delivery: string }>> {
  const ctx = await requireContext();
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return fail("form", { email: "auth.errors.email" });
  try {
    const result = await inviteMember(ctx, { email: email.data, role: roleSchema.parse(input.role) });
    revalidatePath("/settings/team");
    return ok(result);
  } catch (error) {
    if (error instanceof AlreadyMemberError) return fail("form", { email: "settings.team.alreadyMember" });
    return failFrom(error);
  }
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await revokeInvitation(ctx, id);
    revalidatePath("/settings/team");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function changeRoleAction(membershipId: string, role: Role): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await changeRole(ctx, membershipId, roleSchema.parse(role));
    revalidatePath("/settings/team");
    return ok();
  } catch (error) {
    if (error instanceof LastAdminError) return fail("settings.team.lastAdmin");
    return failFrom(error);
  }
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await removeMember(ctx, membershipId);
    revalidatePath("/settings/team");
    return ok();
  } catch (error) {
    if (error instanceof LastAdminError) return fail("settings.team.lastAdmin");
    return failFrom(error);
  }
}

export async function saveProfileAction(input: { name: string; locale: "fr" | "en" }): Promise<ActionResult> {
  const ctx = await requireContext();
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return fail("form", { name: "auth.errors.name" });
  const locale = input.locale === "en" ? "en" : "fr";
  await db.update(user).set({ name: name.data, locale }).where(eq(user.id, ctx.userId));
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return ok();
}

export async function changePasswordAction(input: { currentPassword: string; newPassword: string }): Promise<ActionResult> {
  await requireContext();
  const next = passwordSchema.safeParse(input.newPassword);
  if (!next.success) return fail("form", { newPassword: "auth.errors.password" });
  try {
    await getAuth().api.changePassword({
      body: { currentPassword: input.currentPassword, newPassword: next.data, revokeOtherSessions: true },
      headers: await headers(),
    });
    return ok();
  } catch (error) {
    if (error instanceof APIError) return fail("form", { currentPassword: "settings.profile.wrongPassword" });
    return failFrom(error);
  }
}

