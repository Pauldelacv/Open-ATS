"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { fail, fieldErrorsFrom, type ActionResult } from "@/lib/actions";
import { getAuth } from "@/lib/auth";
import { getSession, ORG_COOKIE } from "@/lib/context";
import { canCreateOrganization, createOrganization } from "@/lib/services/organizations";
import { organizationOnlySchema, setupSchema } from "@/lib/validation/auth";

export async function setupWorkspace(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await getSession();
  const parsed = (session ? organizationOnlySchema : setupSchema).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("form", fieldErrorsFrom(parsed.error.issues));
  if (!(await canCreateOrganization())) return fail("auth.setup.closed");

  let userId = session?.user.id;
  if (!userId) {
    const input = parsed.data as ReturnType<typeof setupSchema.parse>;
    try {
      const result = await getAuth().api.signUpEmail({
        body: { name: input.name, email: input.email, password: input.password },
        headers: await headers(),
      });
      userId = result.user.id;
    } catch (error) {
      if (error instanceof APIError) {
        if (error.body?.message === "SIGNUP_CLOSED") return fail("auth.errors.signupClosed");
        if (error.status === "UNPROCESSABLE_ENTITY" || error.body?.code === "USER_ALREADY_EXISTS") {
          return fail("form", { email: "auth.errors.userExists" });
        }
      }
      console.error(error);
      return fail("common.unknownError");
    }
  }

  const org = await createOrganization(userId, { name: parsed.data.company, locale: parsed.data.locale });
  (await cookies()).set(ORG_COOKIE, org.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/jobs");
}
