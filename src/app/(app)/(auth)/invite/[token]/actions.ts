"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { fail, fieldErrorsFrom, type ActionResult } from "@/lib/actions";
import { getAuth } from "@/lib/auth";
import { getSession, ORG_COOKIE } from "@/lib/context";
import { acceptInvitation, findInvitation, InvitationError } from "@/lib/services/team";
import { inviteSignupSchema } from "@/lib/validation/auth";

async function setOrg(orgId: string) {
  (await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

export async function joinWithInvitation(token: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = inviteSignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("form", fieldErrorsFrom(parsed.error.issues));
  const invitation = await findInvitation(token);
  if (!invitation?.valid) return fail("auth.invite.invalid");
  let account: { id: string; email: string };
  try {
    const result = await getAuth().api.signUpEmail({
      body: { name: parsed.data.name, email: invitation.email, password: parsed.data.password },
      headers: await headers(),
    });
    account = { id: result.user.id, email: result.user.email };
  } catch (error) {
    if (error instanceof APIError && error.body?.code === "USER_ALREADY_EXISTS") return fail("auth.errors.userExists");
    console.error(error);
    return fail("common.unknownError");
  }
  const orgId = await acceptInvitation(token, account);
  await setOrg(orgId);
  redirect("/jobs");
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect(`/login?next=/invite/${token}`);
  try {
    const orgId = await acceptInvitation(token, { id: session.user.id, email: session.user.email });
    await setOrg(orgId);
  } catch (error) {
    if (error instanceof InvitationError) return fail(error.reason === "invalid" ? "auth.invite.invalid" : "auth.invite.mismatch");
    throw error;
  }
  redirect("/jobs");
}
