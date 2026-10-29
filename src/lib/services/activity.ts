import { and, desc, eq } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { activities, jobs, user, type ActivityType } from "@/lib/db/schema";
import type { Ctx } from "./types";

export async function logActivity(
  tx: Tx | typeof db,
  ctx: Pick<Ctx, "orgId" | "rule"> & { userId?: string | null },
  entry: {
    candidateId: string;
    applicationId?: string | null;
    jobId?: string | null;
    type: ActivityType;
    data?: Record<string, string | number | boolean | null>;
  },
) {
  await tx.insert(activities).values({
    organizationId: ctx.orgId,
    actorId: ctx.rule ? null : (ctx.userId ?? null),
    candidateId: entry.candidateId,
    applicationId: entry.applicationId ?? null,
    jobId: entry.jobId ?? null,
    type: entry.type,
    data: ctx.rule ? { ...entry.data, rule: true } : (entry.data ?? {}),
  });
}

export async function listActivity(ctx: Ctx, candidateId: string, limit = 100) {
  return db
    .select({
      id: activities.id,
      type: activities.type,
      data: activities.data,
      createdAt: activities.createdAt,
      actorName: user.name,
      jobId: activities.jobId,
      jobTitle: jobs.title,
      applicationId: activities.applicationId,
    })
    .from(activities)
    .leftJoin(user, eq(user.id, activities.actorId))
    .leftJoin(jobs, eq(jobs.id, activities.jobId))
    .where(and(eq(activities.organizationId, ctx.orgId), eq(activities.candidateId, candidateId)))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
}
