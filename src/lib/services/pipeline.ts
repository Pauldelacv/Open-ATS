import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  candidates,
  candidateTags,
  emailMessages,
  evaluations,
  files,
  pipelineStages,
  tags,
} from "@/lib/db/schema";
import { assertCan, NotFoundError } from "@/lib/permissions";
import { getAccessibleJob } from "./access";
import { logActivity } from "./activity";
import type { Ctx } from "./types";

export type BoardCard = {
  id: string;
  candidateId: string;
  firstName: string;
  lastName: string;
  stageId: string;
  position: number;
  appliedAt: string;
  isNew: boolean;
  rejected: boolean;
  tags: string[];
  evaluationCount: number;
  /** Average rating, only when the viewer has given their own evaluation. */
  averageRating: number | null;
  hasCv: boolean;
  /** Received emails of the candidate nobody has opened yet. */
  unreadReplies: number;
};

export async function getBoard(ctx: Ctx, jobId: string) {
  const job = await getAccessibleJob(ctx, jobId);
  const stages = await db
    .select()
    .from(pipelineStages)
    .where(and(eq(pipelineStages.jobId, job.id), eq(pipelineStages.organizationId, ctx.orgId)))
    .orderBy(asc(pipelineStages.position));

  const rows = await db
    .select({
      id: applications.id,
      candidateId: applications.candidateId,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      stageId: applications.stageId,
      position: applications.position,
      createdAt: applications.createdAt,
      viewedAt: applications.viewedAt,
      rejectedAt: applications.rejectedAt,
      evaluationCount: sql<number>`(select count(*)::int from ${evaluations} e where e.application_id = "applications"."id")`,
      mine: sql<number>`(select count(*)::int from ${evaluations} e where e.application_id = "applications"."id" and e.author_id = ${ctx.userId})`,
      average: sql<
        number | null
      >`(select avg(e.rating)::float from ${evaluations} e where e.application_id = "applications"."id")`,
      hasCv: sql<boolean>`exists(select 1 from ${files} f where f.candidate_id = "applications"."candidate_id" and f.kind = 'cv')`,
      unreadReplies: sql<number>`(select count(*)::int from ${emailMessages} m where m.candidate_id = "applications"."candidate_id" and m.direction = 'inbound' and m.read_at is null)`,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(and(eq(applications.jobId, job.id), eq(applications.organizationId, ctx.orgId)))
    .orderBy(asc(applications.position), asc(applications.createdAt));

  const candidateIds = [...new Set(rows.map((r) => r.candidateId))];
  const tagRows = candidateIds.length
    ? await db
        .select({ candidateId: candidateTags.candidateId, name: tags.name })
        .from(candidateTags)
        .innerJoin(tags, eq(tags.id, candidateTags.tagId))
        .where(
          and(
            eq(candidateTags.organizationId, ctx.orgId),
            inArray(candidateTags.candidateId, candidateIds),
          ),
        )
        .orderBy(asc(tags.name))
    : [];
  const tagsByCandidate = new Map<string, string[]>();
  for (const t of tagRows)
    tagsByCandidate.set(t.candidateId, [...(tagsByCandidate.get(t.candidateId) ?? []), t.name]);

  const cards: BoardCard[] = rows.map((r) => ({
    id: r.id,
    candidateId: r.candidateId,
    firstName: r.firstName,
    lastName: r.lastName,
    stageId: r.stageId,
    position: r.position,
    appliedAt: r.createdAt.toISOString(),
    isNew: r.viewedAt === null && r.rejectedAt === null,
    rejected: r.rejectedAt !== null,
    tags: tagsByCandidate.get(r.candidateId) ?? [],
    evaluationCount: r.evaluationCount,
    averageRating: r.mine > 0 ? r.average : null,
    hasCv: r.hasCv,
    unreadReplies: r.unreadReplies,
  }));
  return { job, stages, cards };
}

/**
 * Moves applications to `stageId`, inserted before the card at `index` of that column
 * (cards being moved excluded). Returns where each application was, for undo.
 */
export async function moveApplications(
  ctx: Ctx,
  applicationIds: string[],
  stageId: string,
  index: number,
) {
  assertCan(ctx.role, "pipeline:move");
  if (applicationIds.length === 0) return [];
  return db.transaction(async (tx) => {
    const [stage] = await tx
      .select()
      .from(pipelineStages)
      .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.organizationId, ctx.orgId)));
    if (!stage) throw new NotFoundError("Stage");
    await getAccessibleJob(ctx, stage.jobId);

    const moving = await tx
      .select({
        id: applications.id,
        stageId: applications.stageId,
        position: applications.position,
        candidateId: applications.candidateId,
        rejectedAt: applications.rejectedAt,
        stageName: pipelineStages.name,
      })
      .from(applications)
      .innerJoin(pipelineStages, eq(pipelineStages.id, applications.stageId))
      .where(
        and(
          inArray(applications.id, applicationIds),
          eq(applications.organizationId, ctx.orgId),
          eq(applications.jobId, stage.jobId),
        ),
      );
    if (moving.length === 0) throw new NotFoundError("Application");

    const column = await tx
      .select({ id: applications.id, position: applications.position })
      .from(applications)
      .where(
        and(
          eq(applications.stageId, stageId),
          notInArray(
            applications.id,
            moving.map((m) => m.id),
          ),
        ),
      )
      .orderBy(asc(applications.position), asc(applications.createdAt));
    const at = Math.max(0, Math.min(index, column.length));
    const before = column[at - 1]?.position;
    const after = column[at]?.position;
    const start = before ?? (after !== undefined ? after - moving.length - 1 : 0);
    const end = after ?? start + moving.length + 1;
    const step = (end - start) / (moving.length + 1);

    // Keep the requested order of the moved cards.
    const order = new Map(applicationIds.map((id, i) => [id, i]));
    const sorted = [...moving].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const now = new Date();
    for (const [i, app] of sorted.entries()) {
      const changedStage = app.stageId !== stageId;
      await tx
        .update(applications)
        .set({
          stageId,
          position: start + step * (i + 1),
          ...(changedStage ? { stageChangedAt: now } : {}),
          ...(stage.kind === "hired" ? { hiredAt: now } : {}),
          ...(stage.kind !== "rejected" && app.rejectedAt
            ? { rejectedAt: null, rejectionReason: null }
            : {}),
          ...(stage.kind === "rejected" && !app.rejectedAt ? { rejectedAt: now } : {}),
        })
        .where(eq(applications.id, app.id));
      if (changedStage) {
        await tx
          .update(candidates)
          .set({ lastActivityAt: now })
          .where(eq(candidates.id, app.candidateId));
        await logActivity(tx, ctx, {
          candidateId: app.candidateId,
          applicationId: app.id,
          jobId: stage.jobId,
          type:
            stage.kind === "hired"
              ? "hired"
              : app.rejectedAt && stage.kind !== "rejected"
                ? "unrejected"
                : "stage_changed",
          data: { from: app.stageName, to: stage.name },
        });
      }
    }
    return moving.map((m) => ({ id: m.id, stageId: m.stageId, position: m.position }));
  });
}

/** Restores positions returned by `moveApplications` (undo). */
export async function restorePositions(
  ctx: Ctx,
  previous: Array<{ id: string; stageId: string; position: number }>,
) {
  assertCan(ctx.role, "pipeline:move");
  await db.transaction(async (tx) => {
    for (const p of previous) {
      const [stage] = await tx
        .select({
          id: pipelineStages.id,
          kind: pipelineStages.kind,
          name: pipelineStages.name,
          jobId: pipelineStages.jobId,
        })
        .from(pipelineStages)
        .where(and(eq(pipelineStages.id, p.stageId), eq(pipelineStages.organizationId, ctx.orgId)));
      if (!stage) continue;
      const [app] = await tx
        .select({ candidateId: applications.candidateId, stageId: applications.stageId })
        .from(applications)
        .where(and(eq(applications.id, p.id), eq(applications.organizationId, ctx.orgId)));
      if (!app) continue;
      await tx
        .update(applications)
        .set({
          stageId: p.stageId,
          position: p.position,
          stageChangedAt: new Date(),
          ...(stage.kind !== "rejected" ? { rejectedAt: null, rejectionReason: null } : {}),
          ...(stage.kind !== "hired" ? { hiredAt: null } : {}),
        })
        .where(eq(applications.id, p.id));
      if (app.stageId !== p.stageId) {
        await logActivity(tx, ctx, {
          candidateId: app.candidateId,
          applicationId: p.id,
          jobId: stage.jobId,
          type: "stage_changed",
          data: { to: stage.name, undo: true },
        });
      }
    }
  });
}

/** First time a team member opens an application, it stops being « new ». */
export async function markViewed(ctx: Ctx, applicationId: string) {
  await db
    .update(applications)
    .set({ viewedAt: new Date() })
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.organizationId, ctx.orgId),
        isNull(applications.viewedAt),
      ),
    );
}
