import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  candidates,
  emailMessages,
  interviews,
  jobs,
  notes,
  notifications,
  pipelineStages,
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

/** Mentions in notes, candidates' replies, rule reminders and other events for the viewer. */
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
      interviewStartsAt: interviews.startsAt,
      ruleMessage: notifications.message,
      stageName: pipelineStages.name,
      authorName: user.name,
    })
    .from(notifications)
    .innerJoin(candidates, eq(candidates.id, notifications.candidateId))
    .leftJoin(notes, eq(notes.id, notifications.noteId))
    .leftJoin(emailMessages, eq(emailMessages.id, notifications.emailMessageId))
    .leftJoin(interviews, eq(interviews.id, notifications.interviewId))
    .leftJoin(applications, eq(applications.id, notifications.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(pipelineStages, eq(pipelineStages.id, applications.stageId))
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
