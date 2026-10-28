import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, candidates, jobs, notes, notifications, user } from "@/lib/db/schema";
import type { Ctx } from "./types";

export async function unreadMentionCount(ctx: Ctx): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, ctx.orgId),
        eq(notifications.userId, ctx.userId),
        isNull(notifications.readAt),
      ),
    );
  return row?.total ?? 0;
}

export async function listMentions(ctx: Ctx, limit = 50) {
  return db
    .select({
      id: notifications.id,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      candidateId: notifications.candidateId,
      applicationId: notifications.applicationId,
      jobId: applications.jobId,
      jobTitle: jobs.title,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      body: notes.body,
      authorName: user.name,
    })
    .from(notifications)
    .innerJoin(candidates, eq(candidates.id, notifications.candidateId))
    .leftJoin(notes, eq(notes.id, notifications.noteId))
    .leftJoin(applications, eq(applications.id, notifications.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(user, eq(user.id, notifications.actorId))
    .where(and(eq(notifications.organizationId, ctx.orgId), eq(notifications.userId, ctx.userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markMentionsRead(ctx: Ctx, ids?: string[]) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.organizationId, ctx.orgId),
        eq(notifications.userId, ctx.userId),
        isNull(notifications.readAt),
        ids ? inArray(notifications.id, ids) : undefined,
      ),
    );
}
