import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { account, invitations, organizations, session, user, verification } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { serverTranslator } from "@/i18n/server";
import { deliver, textToHtml } from "@/lib/mail";
import { authSecret } from "./secret";

/**
 * Whether a new account may be created for this email address: while the instance has no
 * organisation of its own yet (first setup; the demo one does not count), for an invited
 * address, or always when ALLOW_SIGNUP is set.
 */
export async function signUpAllowed(email: string): Promise<boolean> {
  if (env().ALLOW_SIGNUP) return true;
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(organizations)
    .where(eq(organizations.isDemo, false));
  if (total === 0) return true;
  const pending = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email.toLowerCase()),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return pending.length > 0;
}

function createAuth() {
  return betterAuth({
    appName: "Open ATS",
    baseURL: env().APP_URL,
    secret: authSecret(),
    trustedOrigins: [env().APP_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
    },
    user: {
      additionalFields: {
        locale: { type: "string", required: false, input: false },
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (data) => {
            const email = String(data.email ?? "").toLowerCase();
            if (!(await signUpAllowed(email))) {
              throw new APIError("FORBIDDEN", { message: "SIGNUP_CLOSED" });
            }
            return { data: { ...data, email } };
          },
        },
      },
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => {
          const [row] = await db
            .select({ locale: user.locale })
            .from(user)
            .where(eq(user.email, email.toLowerCase()));
          const t = serverTranslator(row?.locale === "en" ? "en" : "fr", "emails.magicLink");
          const text = t("body", { url });
          // Never journaled: a stored link would let anyone reading the journal sign in.
          await deliver({ to: email, subject: t("subject"), text, html: textToHtml(text) });
        },
      }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __openAtsAuth?: Auth };

/** Created on first use so that `next build` never needs runtime secrets. */
export function getAuth(): Auth {
  globalForAuth.__openAtsAuth ??= createAuth();
  return globalForAuth.__openAtsAuth;
}
