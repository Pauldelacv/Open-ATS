import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  candidates,
  emailMessages,
  evaluations,
  files,
  jobs,
  memberships,
  notes,
  notifications,
  organizations,
  pipelineStages,
  user,
} from "@/lib/db/schema";
import { appUrl } from "@/lib/env";
import { serverTranslator } from "@/i18n/server";
import { deliver, textToHtml } from "@/lib/mail";
import { mentionedIds, plainNote } from "@/lib/mentions";
import { assertCan, ForbiddenError, NotFoundError } from "@/lib/permissions";
import { candidateAccess, jobAccess } from "./access";
import { listActivity, logActivity } from "./activity";
import { listCandidateEmails } from "./emails";
import { markViewed } from "./pipeline";
import { refreshSearchText } from "./search-index";
import { candidateTagList } from "./tags";
import type { Ctx } from "./types";

/** Application with its candidate, only when the viewer may see the job. */
async function accessibleApplication(ctx: Ctx, applicationId: string) {
  const [row] = await db
    .select({
      application: applications,
      candidate: candidates,
      job: { id: jobs.id, title: jobs.title, status: jobs.status },
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.organizationId, ctx.orgId),
        jobAccess(ctx),
      ),
    );
  if (!row) throw new NotFoundError("Application");
  return row;
}

export async function assertCandidateAccess(ctx: Ctx, candidateId: string) {
  const [row] = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.organizationId, ctx.orgId),
        candidateAccess(ctx, candidates.id),
      ),
    );
  if (!row) throw new NotFoundError("Candidate");
  return row;
}

export async function listCvFiles(ctx: Ctx, candidateId: string) {
  return db
    .select({
      id: files.id,
      fileName: files.fileName,
      mimeType: files.mimeType,
      size: files.size,
      createdAt: files.createdAt,
      applicationId: files.applicationId,
    })
    .from(files)
    .where(and(eq(files.candidateId, candidateId), eq(files.organizationId, ctx.orgId)))
    .orderBy(desc(files.createdAt));
}

/** Other applications of the same candidate that the viewer can see. */
export async function listCandidateApplications(ctx: Ctx, candidateId: string) {
  return db
    .select({
      id: applications.id,
      jobId: jobs.id,
      jobTitle: jobs.title,
      jobStatus: jobs.status,
      stageName: pipelineStages.name,
      stageKind: pipelineStages.kind,
      createdAt: applications.createdAt,
      rejectedAt: applications.rejectedAt,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(pipelineStages, eq(pipelineStages.id, applications.stageId))
    .where(
      and(
        eq(applications.candidateId, candidateId),
        eq(applications.organizationId, ctx.orgId),
        jobAccess(ctx),
      ),
    )
    .orderBy(desc(applications.createdAt));
}

export async function listNotes(ctx: Ctx, candidateId: string) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      authorId: notes.authorId,
      authorName: user.name,
      applicationId: notes.applicationId,
      jobTitle: jobs.title,
    })
    .from(notes)
    .leftJoin(user, eq(user.id, notes.authorId))
    .leftJoin(applications, eq(applications.id, notes.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(notes.candidateId, candidateId), eq(notes.organizationId, ctx.orgId)))
    .orderBy(desc(notes.createdAt));
}

export async function listTeamDirectory(ctx: Ctx) {
  return db
    .select({ id: user.id, name: user.name, role: memberships.role })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.organizationId, ctx.orgId))
    .orderBy(asc(user.name));
}

/**
 * Evaluations of an application. Others' ratings stay hidden until the viewer has submitted
 * their own, so that nobody is influenced before forming an opinion.
 */
export async function listEvaluations(ctx: Ctx, applicationId: string) {
  const rows = await db
    .select({
      id: evaluations.id,
      authorId: evaluations.authorId,
      authorName: user.name,
      rating: evaluations.rating,
      comment: evaluations.comment,
      updatedAt: evaluations.updatedAt,
    })
    .from(evaluations)
    .innerJoin(user, eq(user.id, evaluations.authorId))
    .where(
      and(eq(evaluations.applicationId, applicationId), eq(evaluations.organizationId, ctx.orgId)),
    )
    .orderBy(desc(evaluations.updatedAt));
  const mine = rows.find((r) => r.authorId === ctx.userId) ?? null;
  const others = rows.filter((r) => r.authorId !== ctx.userId);
  if (!mine) return { mine: null, others: [], hiddenCount: others.length, average: null };
  const average = rows.reduce((sum, r) => sum + r.rating, 0) / rows.length;
  return { mine, others, hiddenCount: 0, average };
}

export async function getApplicationDetail(ctx: Ctx, applicationId: string) {
  const { application, candidate, job } = await accessibleApplication(ctx, applicationId);
  await markViewed(ctx, applicationId);
  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.id, application.stageId));
  const [cvs, tagList, noteList, evaluationData, activity, emails, otherApplications, team] =
    await Promise.all([
      listCvFiles(ctx, candidate.id),
      candidateTagList(ctx, candidate.id),
      listNotes(ctx, candidate.id),
      listEvaluations(ctx, applicationId),
      listActivity(ctx, candidate.id),
      listCandidateEmails(ctx, candidate.id),
      listCandidateApplications(ctx, candidate.id),
      listTeamDirectory(ctx),
    ]);
  return {
    application: {
      id: application.id,
      stageId: application.stageId,
      stageName: stage?.name ?? "",
      stageKind: stage?.kind ?? "active",
      source: application.source,
      message: application.message,
      answers: application.answers,
      consentAt: application.consentAt,
      consentText: application.consentText,
      createdAt: application.createdAt,
      rejectedAt: application.rejectedAt,
      rejectionReason: application.rejectionReason,
      hiredAt: application.hiredAt,
    },
    job,
    candidate: {
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      linkUrl: candidate.linkUrl,
      createdAt: candidate.createdAt,
      lastActivityAt: candidate.lastActivityAt,
      anonymizedAt: candidate.anonymizedAt,
    },
    cvs,
    tags: tagList,
    notes: noteList,
    evaluations: evaluationData,
    activity,
    emails,
    otherApplications: otherApplications.filter((a) => a.id !== applicationId),
    team,
  };
}

export type ApplicationDetail = Awaited<ReturnType<typeof getApplicationDetail>>;

/* ---------------------------------- Notes ---------------------------------- */

export async function addNote(
  ctx: Ctx,
  input: { candidateId: string; applicationId?: string | null; body: string },
) {
  assertCan(ctx.role, "candidate:note");
  const candidate = await assertCandidateAccess(ctx, input.candidateId);
  const body = input.body.trim().slice(0, 10_000);
  if (!body) throw new Error("Empty note");
  let applicationId: string | null = null;
  let jobId: string | null = null;
  if (input.applicationId) {
    const { application } = await accessibleApplication(ctx, input.applicationId);
    applicationId = application.id;
    jobId = application.jobId;
  }
  const team = await listTeamDirectory(ctx);
  const teamIds = new Set(team.map((m) => m.id));
  const mentions = mentionedIds(body).filter((id) => teamIds.has(id));
  const [note] = await db
    .insert(notes)
    .values({
      organizationId: ctx.orgId,
      candidateId: candidate.id,
      applicationId,
      authorId: ctx.userId,
      body,
      mentionedUserIds: mentions,
    })
    .returning();
  await db
    .update(candidates)
    .set({ lastActivityAt: new Date() })
    .where(eq(candidates.id, candidate.id));
  await logActivity(db, ctx, {
    candidateId: candidate.id,
    applicationId,
    jobId,
    type: "note_added",
  });
  await refreshSearchText(db, candidate.id);

  const recipients = mentions.filter((id) => id !== ctx.userId);
  if (recipients.length > 0) {
    await db.insert(notifications).values(
      recipients.map((userId) => ({
        organizationId: ctx.orgId,
        userId,
        actorId: ctx.userId,
        type: "mention" as const,
        noteId: note!.id,
        candidateId: candidate.id,
        applicationId,
      })),
    );
    await notifyMentions(ctx, {
      recipients,
      body,
      candidate,
      applicationId,
      jobId,
      names: new Map(team.map((m) => [m.id, m.name])),
    });
  }
  return note!;
}

async function notifyMentions(
  ctx: Ctx,
  input: {
    recipients: string[];
    body: string;
    candidate: { id: string; firstName: string; lastName: string };
    applicationId: string | null;
    jobId: string | null;
    names: Map<string, string>;
  },
) {
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId));
  const people = await db
    .select({ id: user.id, email: user.email, locale: user.locale })
    .from(user)
    .where(inArray(user.id, input.recipients));
  const author = input.names.get(ctx.userId) ?? "";
  const url = appUrl(
    input.applicationId && input.jobId
      ? `/jobs/${input.jobId}?a=${input.applicationId}`
      : `/candidates/${input.candidate.id}`,
  );
  const excerpt = plainNote(input.body, input.names).slice(0, 500);
  for (const person of people) {
    const t = serverTranslator(person.locale === "en" ? "en" : "fr", "emails.mention");
    const candidateName = `${input.candidate.firstName} ${input.candidate.lastName}`;
    const subject = t("subject", { author, candidate: candidateName });
    const text = t("body", { author, candidate: candidateName, excerpt, url });
    const result = await deliver({
      to: person.email,
      subject,
      text,
      html: textToHtml(text),
      fromName: org?.name,
    });
    await db.insert(emailMessages).values({
      organizationId: ctx.orgId,
      category: "team",
      toEmail: person.email,
      subject,
      body: text,
      status: result.status,
      error: result.error,
      sentById: ctx.userId,
    });
  }
}

export async function deleteNote(ctx: Ctx, noteId: string) {
  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.organizationId, ctx.orgId)));
  if (!note) throw new NotFoundError("Note");
  if (note.authorId !== ctx.userId && ctx.role !== "admin") throw new ForbiddenError();
  await db.delete(notes).where(eq(notes.id, noteId));
  await refreshSearchText(db, note.candidateId);
}

/* -------------------------------- Evaluations ------------------------------- */

export async function saveEvaluation(
  ctx: Ctx,
  input: { applicationId: string; rating: number; comment: string },
) {
  assertCan(ctx.role, "candidate:evaluate");
  const { application } = await accessibleApplication(ctx, input.applicationId);
  const rating = Math.round(input.rating);
  if (rating < 1 || rating > 5) throw new Error("Rating out of range");
  const comment = input.comment.trim().slice(0, 5000);
  const [existing] = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(
      and(eq(evaluations.applicationId, application.id), eq(evaluations.authorId, ctx.userId)),
    );
  await db
    .insert(evaluations)
    .values({
      organizationId: ctx.orgId,
      applicationId: application.id,
      authorId: ctx.userId,
      rating,
      comment,
    })
    .onConflictDoUpdate({
      target: [evaluations.applicationId, evaluations.authorId],
      set: { rating, comment, updatedAt: new Date() },
    });
  if (!existing) {
    await logActivity(db, ctx, {
      candidateId: application.candidateId,
      applicationId: application.id,
      jobId: application.jobId,
      type: "evaluated",
    });
  }
  return listEvaluations(ctx, application.id);
}

/* ------------------------------ Candidate edits ----------------------------- */

export async function updateCandidateDetails(
  ctx: Ctx,
  candidateId: string,
  input: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    linkUrl: string | null;
  },
) {
  assertCan(ctx.role, "candidate:create");
  await assertCandidateAccess(ctx, candidateId);
  if (input.email) {
    const [clash] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.organizationId, ctx.orgId),
          eq(candidates.email, input.email.toLowerCase()),
          ne(candidates.id, candidateId),
        ),
      );
    if (clash) throw new DuplicateCandidateError();
  }
  await db
    .update(candidates)
    .set({ ...input, email: input.email?.toLowerCase() ?? null })
    .where(and(eq(candidates.id, candidateId), eq(candidates.organizationId, ctx.orgId)));
  await refreshSearchText(db, candidateId);
}

export class DuplicateCandidateError extends Error {
  constructor() {
    super("A candidate with this email already exists");
    this.name = "DuplicateCandidateError";
  }
}

export async function candidateCount(ctx: Ctx) {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(candidates)
    .where(and(eq(candidates.organizationId, ctx.orgId), candidateAccess(ctx, candidates.id)));
  return row?.total ?? 0;
}
