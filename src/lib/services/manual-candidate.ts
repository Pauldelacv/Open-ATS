import { and, asc, eq, min, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, candidates, pipelineStages } from "@/lib/db/schema";
import { assertCan } from "@/lib/permissions";
import { getAccessibleJob } from "./access";
import { logActivity } from "./activity";
import { storeCv, type IncomingCv } from "./public-application";
import { refreshSearchText } from "./search-index";
import type { Ctx } from "./types";

export class AlreadyAppliedError extends Error {
  constructor() {
    super("Candidate already applied to this job");
    this.name = "AlreadyAppliedError";
  }
}

/** A recruiter adds a candidate to a job (CV received by email, referral…). */
export async function addCandidateToJob(
  ctx: Ctx,
  jobId: string,
  input: { firstName: string; lastName: string; email: string | null; phone: string | null; linkUrl: string | null },
  cv: IncomingCv | null,
) {
  assertCan(ctx.role, "candidate:create");
  const job = await getAccessibleJob(ctx, jobId);
  const now = new Date();
  const { candidateId, applicationId } = await db.transaction(async (tx) => {
    const [firstStage] = await tx
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(eq(pipelineStages.jobId, job.id))
      .orderBy(sql`case when ${pipelineStages.kind} = 'new' then 0 else 1 end`, asc(pipelineStages.position))
      .limit(1);
    let candidateId: string;
    if (input.email) {
      const [row] = await tx
        .insert(candidates)
        .values({ organizationId: ctx.orgId, ...input, email: input.email.toLowerCase(), lastActivityAt: now })
        .onConflictDoUpdate({ target: [candidates.organizationId, candidates.email], set: { lastActivityAt: now } })
        .returning({ id: candidates.id });
      candidateId = row!.id;
    } else {
      const [row] = await tx.insert(candidates).values({ organizationId: ctx.orgId, ...input, lastActivityAt: now }).returning({ id: candidates.id });
      candidateId = row!.id;
    }
    const [existing] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.jobId, job.id), eq(applications.candidateId, candidateId)));
    if (existing) throw new AlreadyAppliedError();
    const [top] = await tx.select({ value: min(applications.position) }).from(applications).where(eq(applications.stageId, firstStage!.id));
    const [app] = await tx
      .insert(applications)
      .values({
        organizationId: ctx.orgId,
        candidateId,
        jobId: job.id,
        stageId: firstStage!.id,
        position: (top?.value ?? 1) - 1,
        source: "manual",
        viewedAt: now,
      })
      .returning({ id: applications.id });
    return { candidateId, applicationId: app!.id };
  });
  if (cv) await storeCv(ctx.orgId, candidateId, applicationId, cv);
  await logActivity(db, ctx, { candidateId, applicationId, jobId: job.id, type: "added" });
  await refreshSearchText(db, candidateId);
  return { candidateId, applicationId };
}
