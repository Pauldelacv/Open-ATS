import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/permissions";
import { assertCandidateAccess } from "./candidates";
import type { Ctx } from "./types";

/** A CV the viewer may open (organisation and, for members, job assignment checked). */
export async function getAccessibleFile(ctx: Ctx, fileId: string) {
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.organizationId, ctx.orgId)));
  if (!file) throw new NotFoundError("File");
  await assertCandidateAccess(ctx, file.candidateId);
  return file;
}
