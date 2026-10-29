import { and, asc, desc, eq, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import {
  applications,
  automationRules,
  jobMembers,
  jobQuestions,
  jobs,
  memberships,
  organizations,
  pipelineStages,
  type JobStatus,
  type Locale,
  type StageKind,
} from "@/lib/db/schema";
import { serverTranslator } from "@/i18n/server";
import { assertCan, NotFoundError } from "@/lib/permissions";
import { sanitizeRichText } from "@/lib/sanitize";
import { shortId, slugify } from "@/lib/utils/text";
import { jobInputSchema, type JobData, type JobInput } from "@/lib/validation/jobs";
import { getAccessibleJob, jobAccess } from "./access";
import type { Ctx } from "./types";

const activeCount = sql<number>`(
  select count(*)::int from ${applications} a
  inner join ${pipelineStages} s on s.id = a.stage_id
  where a.job_id = "jobs"."id" and s.kind <> 'rejected'
)`;

const newCount = sql<number>`(
  select count(*)::int from ${applications} a
  where a.job_id = "jobs"."id" and a.viewed_at is null and a.rejected_at is null
)`;

export async function listJobs(ctx: Ctx, status?: JobStatus) {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      slug: jobs.slug,
      status: jobs.status,
      department: jobs.department,
      location: jobs.location,
      remote: jobs.remote,
      contract: jobs.contract,
      publishedAt: jobs.publishedAt,
      updatedAt: jobs.updatedAt,
      createdAt: jobs.createdAt,
      activeCount,
      newCount,
    })
    .from(jobs)
    .where(and(jobAccess(ctx), status ? eq(jobs.status, status) : undefined))
    .orderBy(desc(jobs.updatedAt));
}

export async function jobStatusCounts(ctx: Ctx) {
  const rows = await db
    .select({ status: jobs.status, total: sql<number>`count(*)::int` })
    .from(jobs)
    .where(jobAccess(ctx))
    .groupBy(jobs.status);
  const counts: Record<JobStatus, number> = { draft: 0, published: 0, archived: 0 };
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}

export async function getJob(ctx: Ctx, jobId: string) {
  const job = await getAccessibleJob(ctx, jobId);
  const [questions, members] = await Promise.all([
    db
      .select()
      .from(jobQuestions)
      .where(eq(jobQuestions.jobId, job.id))
      .orderBy(asc(jobQuestions.position)),
    db.select({ userId: jobMembers.userId }).from(jobMembers).where(eq(jobMembers.jobId, job.id)),
  ]);
  return { ...job, questions, memberIds: members.map((m) => m.userId) };
}

export type JobDetail = Awaited<ReturnType<typeof getJob>>;

/** Distinct departments and locations already used, to suggest them in the editor. */
export async function jobSuggestions(ctx: Ctx) {
  const rows = await db
    .selectDistinct({ department: jobs.department, location: jobs.location })
    .from(jobs)
    .where(eq(jobs.organizationId, ctx.orgId));
  const departments = [
    ...new Set(rows.map((r) => r.department).filter((v): v is string => Boolean(v))),
  ].sort();
  const locations = [
    ...new Set(rows.map((r) => r.location).filter((v): v is string => Boolean(v))),
  ].sort();
  return { departments, locations };
}

export function defaultStages(locale: Locale): Array<{ name: string; kind: StageKind }> {
  const t = serverTranslator(locale, "defaults.stages");
  return [
    { name: t("new"), kind: "new" },
    { name: t("screening"), kind: "active" },
    { name: t("interview"), kind: "active" },
    { name: t("offer"), kind: "active" },
    { name: t("hired"), kind: "hired" },
    { name: t("rejected"), kind: "rejected" },
  ];
}

async function uniqueJobSlug(tx: Tx, orgId: string, title: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = `${slugify(title, 60)}-${shortId(attempt < 3 ? 4 : 6)}`;
    const clash = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.organizationId, orgId), eq(jobs.slug, slug)))
      .limit(1);
    if (clash.length === 0) return slug;
  }
  return `${slugify(title, 50)}-${shortId(10)}`;
}

/** Keeps only users who belong to the organisation. */
async function validMemberIds(tx: Tx, orgId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.organizationId, orgId), inArray(memberships.userId, ids)));
  return rows.map((r) => r.userId);
}

async function saveQuestions(tx: Tx, ctx: Ctx, jobId: string, questions: JobData["questions"]) {
  const keepIds = questions.map((q) => q.id).filter((id): id is string => Boolean(id));
  await tx
    .delete(jobQuestions)
    .where(
      and(
        eq(jobQuestions.jobId, jobId),
        eq(jobQuestions.organizationId, ctx.orgId),
        keepIds.length ? notInArray(jobQuestions.id, keepIds) : undefined,
      ),
    );
  for (const [position, q] of questions.entries()) {
    const values = {
      label: q.label,
      type: q.type,
      options: q.type === "single_choice" ? q.options.filter(Boolean) : [],
      required: q.required,
      position,
    };
    if (q.id) {
      const updated = await tx
        .update(jobQuestions)
        .set(values)
        .where(and(eq(jobQuestions.id, q.id), eq(jobQuestions.jobId, jobId)))
        .returning({ id: jobQuestions.id });
      if (updated.length > 0) continue;
    }
    await tx.insert(jobQuestions).values({ ...values, organizationId: ctx.orgId, jobId });
  }
}

async function saveMembers(tx: Tx, ctx: Ctx, jobId: string, memberIds: string[]) {
  const ids = await validMemberIds(tx, ctx.orgId, [...new Set(memberIds)]);
  await tx
    .delete(jobMembers)
    .where(and(eq(jobMembers.jobId, jobId), eq(jobMembers.organizationId, ctx.orgId)));
  if (ids.length > 0) {
    await tx
      .insert(jobMembers)
      .values(ids.map((userId) => ({ organizationId: ctx.orgId, jobId, userId })));
  }
}

function jobColumns(data: JobData) {
  return {
    title: data.title,
    descriptionHtml: sanitizeRichText(data.descriptionHtml),
    department: data.department,
    location: data.location,
    remote: data.remote,
    contract: data.contract,
    salaryMin: data.salaryMin,
    salaryMax: data.salaryMax,
    salaryCurrency: data.salaryCurrency.toUpperCase(),
    salaryPeriod: data.salaryPeriod,
  };
}

export async function createJob(ctx: Ctx, input: JobInput, options: { publish?: boolean } = {}) {
  assertCan(ctx.role, "job:manage");
  const data = jobInputSchema.parse(input);
  return db.transaction(async (tx) => {
    const [org] = await tx
      .select({ locale: organizations.locale })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId));
    const now = new Date();
    const [job] = await tx
      .insert(jobs)
      .values({
        ...jobColumns(data),
        organizationId: ctx.orgId,
        slug: await uniqueJobSlug(tx, ctx.orgId, data.title),
        status: options.publish ? "published" : "draft",
        publishedAt: options.publish ? now : null,
        createdById: ctx.userId,
      })
      .returning();
    await tx.insert(pipelineStages).values(
      defaultStages(org?.locale ?? "fr").map((stage, position) => ({
        ...stage,
        position,
        organizationId: ctx.orgId,
        jobId: job!.id,
      })),
    );
    await saveQuestions(tx, ctx, job!.id, data.questions);
    await saveMembers(tx, ctx, job!.id, data.memberIds);
    return job!;
  });
}

export async function updateJob(ctx: Ctx, jobId: string, input: JobInput) {
  assertCan(ctx.role, "job:manage");
  const data = jobInputSchema.parse(input);
  await getAccessibleJob(ctx, jobId);
  return db.transaction(async (tx) => {
    const [job] = await tx
      .update(jobs)
      .set(jobColumns(data))
      .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, ctx.orgId)))
      .returning();
    await saveQuestions(tx, ctx, jobId, data.questions);
    await saveMembers(tx, ctx, jobId, data.memberIds);
    return job!;
  });
}

export async function setJobStatus(ctx: Ctx, jobId: string, status: JobStatus) {
  assertCan(ctx.role, "job:manage");
  const job = await getAccessibleJob(ctx, jobId);
  const now = new Date();
  const [updated] = await db
    .update(jobs)
    .set({
      status,
      publishedAt: status === "published" ? (job.publishedAt ?? now) : job.publishedAt,
      archivedAt: status === "archived" ? now : null,
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, ctx.orgId)))
    .returning();
  return updated!;
}

export class JobHasApplicationsError extends Error {
  constructor() {
    super("Job has applications");
    this.name = "JobHasApplicationsError";
  }
}

/** Only drafts without any application can be deleted; others are archived. */
export async function deleteDraftJob(ctx: Ctx, jobId: string) {
  assertCan(ctx.role, "job:manage");
  const job = await getAccessibleJob(ctx, jobId);
  if (job.status !== "draft") throw new JobHasApplicationsError();
  const [any] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.jobId, jobId))
    .limit(1);
  if (any) throw new JobHasApplicationsError();
  await db.delete(jobs).where(and(eq(jobs.id, jobId), eq(jobs.organizationId, ctx.orgId)));
}

/**
 * Copies a job as a new draft with its pipeline and automatic rules; `title` is the
 * translated « copy » title chosen by the caller.
 */
export async function duplicateJob(ctx: Ctx, jobId: string, title: string) {
  const job = await getJob(ctx, jobId);
  const copy = await createJob(ctx, {
    title,
    descriptionHtml: job.descriptionHtml,
    department: job.department ?? undefined,
    location: job.location ?? undefined,
    remote: job.remote,
    contract: job.contract,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    salaryPeriod: job.salaryPeriod,
    questions: job.questions.map((q) => ({
      label: q.label,
      type: q.type,
      options: q.options,
      required: q.required,
    })),
    memberIds: job.memberIds,
  });
  await copyPipeline(ctx, job.id, copy.id);
  return copy;
}

/** Gives a new job the stages and rules of another; questions are matched by position. */
async function copyPipeline(ctx: Ctx, fromJobId: string, toJobId: string) {
  await db.transaction(async (tx) => {
    const byPosition = <T extends { position: number }>(rows: T[]) =>
      [...rows].sort((a, b) => a.position - b.position);
    const sourceStages = byPosition(
      await tx.select().from(pipelineStages).where(eq(pipelineStages.jobId, fromJobId)),
    );
    await tx.delete(pipelineStages).where(eq(pipelineStages.jobId, toJobId));
    const stageIds = new Map<string, string>();
    for (const stage of sourceStages) {
      const [created] = await tx
        .insert(pipelineStages)
        .values({
          organizationId: ctx.orgId,
          jobId: toJobId,
          name: stage.name,
          kind: stage.kind,
          position: stage.position,
        })
        .returning({ id: pipelineStages.id });
      stageIds.set(stage.id, created!.id);
    }
    const questionsOf = async (id: string) =>
      byPosition(await tx.select().from(jobQuestions).where(eq(jobQuestions.jobId, id)));
    const fromQuestions = await questionsOf(fromJobId);
    const toQuestions = await questionsOf(toJobId);
    const questionIds = new Map(fromQuestions.map((q, i) => [q.id, toQuestions[i]?.id]));
    const rules = await tx
      .select()
      .from(automationRules)
      .where(eq(automationRules.jobId, fromJobId))
      .orderBy(asc(automationRules.position));
    for (const rule of rules) {
      const stageId = stageIds.get(rule.stageId);
      if (!stageId) continue;
      const questionId = rule.condition ? questionIds.get(rule.condition.questionId) : null;
      if (rule.condition && !questionId) continue;
      const params = { ...rule.params };
      if (params.stageId) params.stageId = stageIds.get(params.stageId) ?? params.stageId;
      await tx.insert(automationRules).values({
        organizationId: ctx.orgId,
        jobId: toJobId,
        stageId,
        delayMinutes: rule.delayMinutes,
        condition: rule.condition && questionId ? { ...rule.condition, questionId } : null,
        action: rule.action,
        params,
        enabled: rule.enabled,
        position: rule.position,
        createdById: ctx.userId,
      });
    }
  });
}

/* --------------------------------- Stages --------------------------------- */

export async function listStages(ctx: Ctx, jobId: string) {
  await getAccessibleJob(ctx, jobId);
  return db
    .select()
    .from(pipelineStages)
    .where(and(eq(pipelineStages.jobId, jobId), eq(pipelineStages.organizationId, ctx.orgId)))
    .orderBy(asc(pipelineStages.position));
}

export class StageError extends Error {
  constructor(public readonly reason: "fixed" | "not_empty" | "target") {
    super(`Stage error: ${reason}`);
    this.name = "StageError";
  }
}

/**
 * Replaces the editable part of a pipeline: renames, reorders, adds and removes stages.
 * `new`, `hired` and `rejected` stages can be renamed but not removed. Applications of a
 * removed stage move to `moveTo` (or the first stage).
 */
export async function saveStages(
  ctx: Ctx,
  jobId: string,
  stages: Array<{ id?: string; name: string }>,
) {
  assertCan(ctx.role, "pipeline:edit-stages");
  await getAccessibleJob(ctx, jobId);
  return db.transaction(async (tx) => {
    const current = await tx
      .select()
      .from(pipelineStages)
      .where(and(eq(pipelineStages.jobId, jobId), eq(pipelineStages.organizationId, ctx.orgId)))
      .orderBy(asc(pipelineStages.position));
    const byId = new Map(current.map((s) => [s.id, s]));
    const kept = new Set(
      stages.map((s) => s.id).filter((id): id is string => Boolean(id && byId.has(id))),
    );
    for (const stage of current) {
      if (!kept.has(stage.id) && stage.kind !== "active") throw new StageError("fixed");
    }
    // Insert new stages first so that removed ones can hand over their applications.
    const ordered: string[] = [];
    for (const s of stages) {
      const name = s.name.trim().slice(0, 60);
      if (!name) continue;
      if (s.id && byId.has(s.id)) {
        ordered.push(s.id);
        await tx.update(pipelineStages).set({ name }).where(eq(pipelineStages.id, s.id));
      } else {
        const [created] = await tx
          .insert(pipelineStages)
          .values({ organizationId: ctx.orgId, jobId, name, kind: "active", position: 999 })
          .returning({ id: pipelineStages.id });
        ordered.push(created!.id);
      }
    }
    // Fixed kinds keep their place: new first, then actives in the given order, hired, rejected.
    const kindOf = (id: string) => byId.get(id)?.kind ?? "active";
    const sorted = [
      ...ordered.filter((id) => kindOf(id) === "new"),
      ...ordered.filter((id) => kindOf(id) === "active"),
      ...ordered.filter((id) => kindOf(id) === "hired"),
      ...ordered.filter((id) => kindOf(id) === "rejected"),
    ];
    for (const [position, id] of sorted.entries()) {
      await tx.update(pipelineStages).set({ position }).where(eq(pipelineStages.id, id));
    }
    const removed = current.filter((s) => !kept.has(s.id));
    if (removed.length > 0) {
      const fallback = sorted.find((id) => kindOf(id) === "new") ?? sorted[0];
      await tx
        .update(applications)
        .set({ stageId: fallback!, stageChangedAt: new Date() })
        .where(
          and(
            inArray(
              applications.stageId,
              removed.map((s) => s.id),
            ),
            eq(applications.organizationId, ctx.orgId),
          ),
        );
      // Rules of a removed stage go with it; rules that moved candidates there stop.
      await tx
        .update(automationRules)
        .set({ enabled: false })
        .where(
          and(
            eq(automationRules.jobId, jobId),
            eq(automationRules.action, "move"),
            inArray(
              sql`${automationRules.params}->>'stageId'`,
              removed.map((s) => s.id),
            ),
          ),
        );
      await tx.delete(pipelineStages).where(
        inArray(
          pipelineStages.id,
          removed.map((s) => s.id),
        ),
      );
    }
    return tx
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.jobId, jobId))
      .orderBy(asc(pipelineStages.position));
  });
}

/* ------------------------------- Public site ------------------------------ */

export async function listPublishedJobs(organizationId: string) {
  return db
    .select({
      id: jobs.id,
      title: jobs.title,
      slug: jobs.slug,
      department: jobs.department,
      location: jobs.location,
      remote: jobs.remote,
      contract: jobs.contract,
      salaryMin: jobs.salaryMin,
      salaryMax: jobs.salaryMax,
      salaryCurrency: jobs.salaryCurrency,
      salaryPeriod: jobs.salaryPeriod,
      publishedAt: jobs.publishedAt,
    })
    .from(jobs)
    .where(and(eq(jobs.organizationId, organizationId), eq(jobs.status, "published")))
    .orderBy(desc(jobs.publishedAt));
}

export async function getPublishedJob(organizationId: string, slug: string) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.organizationId, organizationId),
        eq(jobs.slug, slug),
        eq(jobs.status, "published"),
      ),
    );
  if (!job) return null;
  const questions = await db
    .select()
    .from(jobQuestions)
    .where(eq(jobQuestions.jobId, job.id))
    .orderBy(asc(jobQuestions.position));
  return { ...job, questions };
}

/** Every published job of the instance, for the sitemap. */
export async function listAllPublishedJobs() {
  return db
    .select({
      slug: jobs.slug,
      updatedAt: jobs.updatedAt,
      orgSlug: organizations.slug,
      orgUpdatedAt: organizations.updatedAt,
    })
    .from(jobs)
    .innerJoin(organizations, eq(organizations.id, jobs.organizationId))
    .where(
      and(eq(jobs.status, "published"), isNotNull(jobs.publishedAt), ne(organizations.slug, "")),
    );
}

export { NotFoundError };
