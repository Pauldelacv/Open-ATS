import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  candidates,
  emailMessages,
  jobs,
  notes,
  notifications,
  user,
} from "@/lib/db/schema";
import type { Ctx } from "./types";

export async function unreadNotificationCount(ctx: Ctx): Promise<number> {
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

/** Mentions in notes, candidates' replies, and the other events addressed to the viewer. */
export async function listNotifications(ctx: Ctx, limit = 50) {
  return db
    .select({
      id: notifications.id,
      type: notifications.type,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      candidateId: notifications.candidateId,
      applicationId: notifications.applicationId,
      jobId: applications.jobId,
      jobTitle: jobs.title,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      noteBody: notes.body,
      replyBody: emailMessages.body,
      authorName: user.name,
    })
    .from(notifications)
    .innerJoin(candidates, eq(candidates.id, notifications.candidateId))
    .leftJoin(notes, eq(notes.id, notifications.noteId))
    .leftJoin(emailMessages, eq(emailMessages.id, notifications.emailMessageId))
    .leftJoin(applications, eq(applications.id, notifications.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(user, eq(user.id, notifications.actorId))
    .where(and(eq(notifications.organizationId, ctx.orgId), eq(notifications.userId, ctx.userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export type NotificationRow = Awaited<ReturnType<typeof listNotifications>>[number];

export async function markNotificationsRead(ctx: Ctx, ids?: string[]) {
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
