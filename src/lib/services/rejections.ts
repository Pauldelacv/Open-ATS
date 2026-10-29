import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, candidates, pipelineStages } from "@/lib/db/schema";
import { assertCan, NotFoundError } from "@/lib/permissions";
import { logActivity } from "./activity";
import { enqueueStageRules } from "./automation-queue";
import { sendCandidateEmails } from "./emails";
import type { Ctx } from "./types";

import type { RejectionReason } from "./rejection-reasons";

export { rejectionReasons, type RejectionReason } from "./rejection-reasons";

/**
 * Rejects applications: they move to the end of their job's « rejected » stage with a reason,
 * and the candidates optionally receive an email.
 */
export async function rejectApplications(
  ctx: Ctx,
  applicationIds: string[],
  input: {
    reason: RejectionReason;
    email?: { subject: string; body: string; templateId?: string | null } | null;
  },
) {
  assertCan(ctx.role, "candidate:reject");
  if (applicationIds.length === 0)
    return { rejected: 0, emails: [] as Awaited<ReturnType<typeof sendCandidateEmails>> };
  const apps = await db
    .select({
      id: applications.id,
      jobId: applications.jobId,
      candidateId: applications.candidateId,
      stageId: applications.stageId,
      stageName: pipelineStages.name,
    })
    .from(applications)
    .innerJoin(pipelineStages, eq(pipelineStages.id, applications.stageId))
    .where(
      and(inArray(applications.id, applicationIds), eq(applications.organizationId, ctx.orgId)),
    );
  if (apps.length === 0) throw new NotFoundError("Application");

  const now = new Date();
  await db.transaction(async (tx) => {
    const jobIds = [...new Set(apps.map((a) => a.jobId))];
    const rejectedStages = await tx
      .select({ id: pipelineStages.id, jobId: pipelineStages.jobId, name: pipelineStages.name })
      .from(pipelineStages)
      .where(and(inArray(pipelineStages.jobId, jobIds), eq(pipelineStages.kind, "rejected")))
      .orderBy(asc(pipelineStages.position));
    const stageByJob = new Map(rejectedStages.map((s) => [s.jobId, s]));
    for (const app of apps) {
      const stage = stageByJob.get(app.jobId);
      if (!stage) continue;
      const [last] = await tx
        .select({ position: applications.position })
        .from(applications)
        .where(eq(applications.stageId, stage.id))
        .orderBy(desc(applications.position))
        .limit(1);
      await tx
        .update(applications)
        .set({
          stageId: stage.id,
          position: (last?.position ?? 0) + 1,
          rejectedAt: now,
          rejectionReason: input.reason,
          stageChangedAt: now,
          hiredAt: null,
        })
        .where(eq(applications.id, app.id));
      await tx
        .update(candidates)
        .set({ lastActivityAt: now })
        .where(eq(candidates.id, app.candidateId));
      await logActivity(tx, ctx, {
        candidateId: app.candidateId,
        applicationId: app.id,
        jobId: app.jobId,
        type: "rejected",
        data: { reason: input.reason, from: app.stageName, emailed: Boolean(input.email) },
      });
      if (app.stageId !== stage.id)
        await enqueueStageRules(tx, ctx, [
          { applicationId: app.id, stageId: stage.id, enteredAt: now },
        ]);
    }
  });

  const emails = input.email
    ? await sendCandidateEmails(ctx, { applicationIds: apps.map((a) => a.id), ...input.email })
    : [];
  return { rejected: apps.length, emails };
}
