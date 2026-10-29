import { and, asc, count, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { db } from "@/lib/db";
import {
  activities,
  applications,
  candidates,
  candidateTags,
  emailMessages,
  evaluations,
  interviews,
  slotProposals,
  files,
  jobs,
  notes,
  notifications,
  organizations,
  pipelineStages,
  tags,
  user,
} from "@/lib/db/schema";
import { serverTranslator } from "@/i18n/server";
import { assertCan } from "@/lib/permissions";
import { storage } from "@/lib/storage";
import { logActivity } from "./activity";
import { assertCandidateAccess } from "./candidates";
import type { Ctx } from "./types";

/** Date before which a candidate's last activity makes them due for anonymisation. */
export function retentionCutoff(retentionMonths: number, now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);
  return cutoff;
}

async function removeStoredFiles(candidateId: string) {
  const rows = await db
    .select({ key: files.storageKey })
    .from(files)
    .where(eq(files.candidateId, candidateId));
  for (const row of rows)
    await storage()
      .delete(row.key)
      .catch(() => {});
}

/**
 * Removes everything that identifies a candidate while keeping anonymous counts
 * (applications stay in their stage so that pipelines and history stay consistent).
 */
export async function anonymizeCandidate(orgId: string, candidateId: string) {
  const [org] = await db
    .select({ locale: organizations.locale })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const t = serverTranslator(org?.locale ?? "fr", "gdpr");
  await removeStoredFiles(candidateId);
  await db.transaction(async (tx) => {
    const appIds = (
      await tx
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.candidateId, candidateId))
    ).map((a) => a.id);
    await tx.delete(files).where(eq(files.candidateId, candidateId));
    await tx.delete(notes).where(eq(notes.candidateId, candidateId));
    await tx.delete(notifications).where(eq(notifications.candidateId, candidateId));
    await tx.delete(candidateTags).where(eq(candidateTags.candidateId, candidateId));
    await tx.delete(emailMessages).where(eq(emailMessages.candidateId, candidateId));
    await tx.delete(activities).where(eq(activities.candidateId, candidateId));
    await tx.delete(slotProposals).where(eq(slotProposals.candidateId, candidateId));
    await tx.delete(interviews).where(eq(interviews.candidateId, candidateId));
    if (appIds.length) {
      await tx.delete(evaluations).where(inArray(evaluations.applicationId, appIds));
      await tx
        .update(applications)
        .set({ message: null, answers: [], consentText: null, rejectionReason: null })
        .where(inArray(applications.id, appIds));
    }
    await tx
      .update(candidates)
      .set({
        firstName: t("anonymousFirstName"),
        lastName: t("anonymousLastName"),
        email: null,
        phone: null,
        linkUrl: null,
        searchText: "",
        anonymizedAt: new Date(),
      })
      .where(and(eq(candidates.id, candidateId), eq(candidates.organizationId, orgId)));
    await logActivity(tx, { orgId }, { candidateId, type: "anonymized" });
  });
}

/** Anonymises every candidate whose last activity is older than their organisation's retention. */
export async function runRetention(now: Date = new Date()) {
  const orgs = await db
    .select({ id: organizations.id, months: organizations.retentionMonths })
    .from(organizations);
  let total = 0;
  for (const org of orgs) {
    const due = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.organizationId, org.id),
          isNull(candidates.anonymizedAt),
          lt(candidates.lastActivityAt, retentionCutoff(org.months, now)),
        ),
      );
    for (const c of due) {
      await anonymizeCandidate(org.id, c.id);
      total++;
    }
  }
  return total;
}

export async function runRetentionForOrganization(ctx: Ctx, now: Date = new Date()) {
  assertCan(ctx.role, "settings:privacy");
  const [org] = await db
    .select({ months: organizations.retentionMonths })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId));
  const due = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(
      and(
        eq(candidates.organizationId, ctx.orgId),
        isNull(candidates.anonymizedAt),
        lt(candidates.lastActivityAt, retentionCutoff(org!.months, now)),
      ),
    );
  for (const c of due) await anonymizeCandidate(ctx.orgId, c.id);
  return due.length;
}

export async function retentionOverview(ctx: Ctx, now: Date = new Date()) {
  const [org] = await db
    .select({ months: organizations.retentionMonths, contact: organizations.privacyContactEmail })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId));
  const months = org!.months;
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);
  const [[due], [upcoming], [anonymized]] = await Promise.all([
    db
      .select({ total: count() })
      .from(candidates)
      .where(
        and(
          eq(candidates.organizationId, ctx.orgId),
          isNull(candidates.anonymizedAt),
          lt(candidates.lastActivityAt, retentionCutoff(months, now)),
        ),
      ),
    db
      .select({ total: count() })
      .from(candidates)
      .where(
        and(
          eq(candidates.organizationId, ctx.orgId),
          isNull(candidates.anonymizedAt),
          lt(candidates.lastActivityAt, retentionCutoff(months, soon)),
        ),
      ),
    db
      .select({ total: count() })
      .from(candidates)
      .where(
        and(eq(candidates.organizationId, ctx.orgId), sql`${candidates.anonymizedAt} is not null`),
      ),
  ]);
  return {
    months,
    contact: org!.contact,
    due: due?.total ?? 0,
    upcoming: upcoming?.total ?? 0,
    anonymized: anonymized?.total ?? 0,
  };
}

/** Everything known about a candidate, as a ZIP with a JSON file and the CVs. */
export async function exportCandidate(ctx: Ctx, candidateId: string) {
  assertCan(ctx.role, "candidate:export");
  const candidate = await assertCandidateAccess(ctx, candidateId);
  const [apps, noteRows, fileRows, tagRows, emailRows, activityRows] = await Promise.all([
    db
      .select({
        id: applications.id,
        job: jobs.title,
        stage: pipelineStages.name,
        source: applications.source,
        message: applications.message,
        answers: applications.answers,
        consentAt: applications.consentAt,
        consentText: applications.consentText,
        createdAt: applications.createdAt,
        rejectedAt: applications.rejectedAt,
        rejectionReason: applications.rejectionReason,
        hiredAt: applications.hiredAt,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .innerJoin(pipelineStages, eq(pipelineStages.id, applications.stageId))
      .where(eq(applications.candidateId, candidateId))
      .orderBy(asc(applications.createdAt)),
    db
      .select({ body: notes.body, author: user.name, createdAt: notes.createdAt })
      .from(notes)
      .leftJoin(user, eq(user.id, notes.authorId))
      .where(eq(notes.candidateId, candidateId))
      .orderBy(asc(notes.createdAt)),
    db.select().from(files).where(eq(files.candidateId, candidateId)),
    db
      .select({ name: tags.name })
      .from(candidateTags)
      .innerJoin(tags, eq(tags.id, candidateTags.tagId))
      .where(eq(candidateTags.candidateId, candidateId)),
    db
      .select({
        direction: emailMessages.direction,
        from: emailMessages.fromEmail,
        to: emailMessages.toEmail,
        subject: emailMessages.subject,
        body: sql<string>`coalesce(${emailMessages.fullBody}, ${emailMessages.body})`,
        status: emailMessages.status,
        createdAt: emailMessages.createdAt,
      })
      .from(emailMessages)
      .where(
        and(eq(emailMessages.candidateId, candidateId), eq(emailMessages.category, "candidate")),
      )
      .orderBy(asc(emailMessages.createdAt)),
    db
      .select({ type: activities.type, data: activities.data, createdAt: activities.createdAt })
      .from(activities)
      .where(eq(activities.candidateId, candidateId))
      .orderBy(asc(activities.createdAt)),
  ]);
  const appIds = apps.map((a) => a.id);
  const interviewRows = await db
    .select({
      startsAt: interviews.startsAt,
      endsAt: interviews.endsAt,
      locationKind: interviews.locationKind,
      location: interviews.location,
      status: interviews.status,
    })
    .from(interviews)
    .where(eq(interviews.candidateId, candidateId))
    .orderBy(asc(interviews.startsAt));
  const evaluationRows = appIds.length
    ? await db
        .select({
          applicationId: evaluations.applicationId,
          author: user.name,
          rating: evaluations.rating,
          comment: evaluations.comment,
          updatedAt: evaluations.updatedAt,
        })
        .from(evaluations)
        .innerJoin(user, eq(user.id, evaluations.authorId))
        .where(inArray(evaluations.applicationId, appIds))
    : [];
  const data = {
    exportedAt: new Date().toISOString(),
    candidate: {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
      link: candidate.linkUrl,
      createdAt: candidate.createdAt,
      lastActivityAt: candidate.lastActivityAt,
    },
    tags: tagRows.map((t) => t.name),
    applications: apps.map((a) => ({
      ...a,
      evaluations: evaluationRows.filter((e) => e.applicationId === a.id),
    })),
    notes: noteRows,
    emails: emailRows,
    interviews: interviewRows,
    activity: activityRows,
    files: fileRows.map((f) => ({
      name: f.fileName,
      type: f.mimeType,
      size: f.size,
      addedAt: f.createdAt,
    })),
  };
  const entries: Record<string, Uint8Array> = {
    "candidate.json": strToU8(JSON.stringify(data, null, 2)),
  };
  for (const f of fileRows) {
    const bytes = await storage().get(f.storageKey);
    if (bytes)
      entries[`files/${f.id.slice(0, 8)}-${f.fileName.replace(/[\\/]/g, "_")}`] = new Uint8Array(
        bytes,
      );
  }
  await logActivity(db, ctx, { candidateId, type: "exported" });
  const safeName =
    `${candidate.firstName}-${candidate.lastName}`
      .normalize("NFD")
      .replace(/[^\w-]+/g, "")
      .toLowerCase() || "candidate";
  return { fileName: `${safeName}-export.zip`, zip: zipSync(entries, { level: 6 }) };
}

/** Permanent deletion: rows (cascade) and stored files. */
export async function deleteCandidate(ctx: Ctx, candidateId: string) {
  assertCan(ctx.role, "candidate:delete");
  await assertCandidateAccess(ctx, candidateId);
  await removeStoredFiles(candidateId);
  await db
    .delete(candidates)
    .where(and(eq(candidates.id, candidateId), eq(candidates.organizationId, ctx.orgId)));
}
