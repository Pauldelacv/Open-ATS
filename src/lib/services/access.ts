import { and, eq, exists, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, jobMembers, jobs } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/permissions";
import type { Ctx } from "./types";

/**
 * Condition on `jobs` restricting rows to the organisation and, for members, to the jobs
 * they are assigned to.
 */
export function jobAccess(ctx: Ctx): SQL {
  const org = eq(jobs.organizationId, ctx.orgId);
  if (ctx.role !== "member") return org;
  return and(
    org,
    exists(
      db
        .select({ one: sql`1` })
        .from(jobMembers)
        .where(and(eq(jobMembers.jobId, jobs.id), eq(jobMembers.userId, ctx.userId))),
    ),
  )!;
}

/** Condition on `candidates.id`: members only reach candidates of their jobs. */
export function candidateAccess(ctx: Ctx, candidateIdColumn: SQL | typeof applications.candidateId): SQL | undefined {
  if (ctx.role !== "member") return undefined;
  return exists(
    db
      .select({ one: sql`1` })
      .from(applications)
      .innerJoin(jobMembers, and(eq(jobMembers.jobId, applications.jobId), eq(jobMembers.userId, ctx.userId)))
      .where(eq(applications.candidateId, candidateIdColumn)),
  );
}

export async function getAccessibleJob(ctx: Ctx, jobId: string) {
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), jobAccess(ctx)));
  if (!job) throw new NotFoundError("Job");
  return job;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
