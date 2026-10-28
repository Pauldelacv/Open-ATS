import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { memberships, organizations, type Role } from "@/lib/db/schema";
import type { Ctx } from "@/lib/services/types";

export const ORG_COOKIE = "oats_org";

export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>["user"];

/** Memberships of the signed-in user with their organisation, oldest first. */
export const getMemberships = cache(async (userId: string) => {
  return db
    .select({
      role: memberships.role,
      org: {
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        logoKey: organizations.logoKey,
        locale: organizations.locale,
      },
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));
});

async function resolveContext(): Promise<
  { status: "anonymous" } | { status: "no-organization"; user: SessionUser } | { status: "ok"; ctx: Ctx; user: SessionUser }
> {
  const session = await getSession();
  if (!session) return { status: "anonymous" };
  const list = await getMemberships(session.user.id);
  if (list.length === 0) return { status: "no-organization", user: session.user };
  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const active = list.find((m) => m.org.id === preferred) ?? list[0]!;
  return {
    status: "ok",
    user: session.user,
    ctx: { orgId: active.org.id, userId: session.user.id, role: active.role as Role },
  };
}

const getResolvedContext = cache(resolveContext);

/** For pages and server actions: redirects when there is no usable context. */
export async function requireContext(): Promise<Ctx & { user: SessionUser }> {
  const resolved = await getResolvedContext();
  if (resolved.status === "anonymous") redirect("/login");
  if (resolved.status === "no-organization") redirect("/setup");
  return { ...resolved.ctx, user: resolved.user };
}

/** For route handlers: returns null instead of redirecting. */
export async function getApiContext(): Promise<(Ctx & { user: SessionUser }) | null> {
  const resolved = await getResolvedContext();
  return resolved.status === "ok" ? { ...resolved.ctx, user: resolved.user } : null;
}
