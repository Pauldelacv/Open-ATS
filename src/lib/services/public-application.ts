import { and, asc, eq, min, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, candidates, files, pipelineStages, type ApplicationAnswer } from "@/lib/db/schema";
import { extractCvText } from "@/lib/cv-text";
import { storage } from "@/lib/storage";
import { CV_MIME, cvKind, cvSignatureMatches, MAX_CV_BYTES, type ApplicationData, type PublicQuestion } from "@/lib/validation/application";
import { logActivity } from "./activity";
import { sendConfirmationEmail } from "./emails";
import { refreshSearchText } from "./search-index";

export class CvRejectedError extends Error {
  constructor() {
    super("CV rejected");
    this.name = "CvRejectedError";
  }
}

export type IncomingCv = { name: string; type: string; size: number; data: Buffer };

export function cvStorageKey(orgId: string, candidateId: string, fileId: string, kind: "pdf" | "docx") {
  return `org/${orgId}/candidates/${candidateId}/${fileId}.${kind}`;
}

/** Stores a CV and its extracted text for a candidate. */
export async function storeCv(orgId: string, candidateId: string, applicationId: string | null, cv: IncomingCv) {
  const kind = cvKind(cv);
  if (!kind || cv.size > MAX_CV_BYTES || !cvSignatureMatches(kind, cv.data)) throw new CvRejectedError();
  const fileId = crypto.randomUUID();
  const key = cvStorageKey(orgId, candidateId, fileId, kind);
  await storage().put(key, cv.data, CV_MIME[kind]);
  const textContent = await extractCvText(kind, cv.data);
  const safeName = cv.name.replace(/[\\/\0]/g, "_").slice(0, 200) || `cv.${kind}`;
  await db.insert(files).values({
    id: fileId,
    organizationId: orgId,
    candidateId,
    applicationId,
    kind: "cv",
    storageKey: key,
    fileName: safeName,
    mimeType: CV_MIME[kind],
    size: cv.size,
    textContent,
  });
  return fileId;
}

/**
 * Records an application coming from the career site. Candidates are deduplicated by email
 * within the organisation; applying twice to the same job updates the existing application.
 */
export async function submitPublicApplication(input: {
  organizationId: string;
  jobId: string;
  questions: PublicQuestion[];
  data: ApplicationData;
  cv: IncomingCv;
  consentText: string;
}) {
  const { organizationId: orgId, jobId } = input;
  const data = { ...input.data, email: input.data.email.trim().toLowerCase() };
  const kind = cvKind(input.cv);
  if (!kind || !cvSignatureMatches(kind, input.cv.data)) throw new CvRejectedError();

  const answers: ApplicationAnswer[] = input.questions
    .map((q) => ({ questionId: q.id, label: q.label, type: q.type, value: data.answers[q.id] ?? "" }))
    .filter((a) => a.value !== "");
  const now = new Date();

  const { candidateId, applicationId, reapplied } = await db.transaction(async (tx) => {
    const [firstStage] = await tx
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(and(eq(pipelineStages.jobId, jobId), eq(pipelineStages.organizationId, orgId)))
      .orderBy(sql`case when ${pipelineStages.kind} = 'new' then 0 else 1 end`, asc(pipelineStages.position))
      .limit(1);
    if (!firstStage) throw new Error("Job has no pipeline stage");

    const [candidate] = await tx
      .insert(candidates)
      .values({
        organizationId: orgId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        linkUrl: data.link || null,
        lastActivityAt: now,
      })
      .onConflictDoUpdate({
        target: [candidates.organizationId, candidates.email],
        set: {
          firstName: data.firstName,
          lastName: data.lastName,
          phone: sql`coalesce(${data.phone || null}::text, ${candidates.phone})`,
          linkUrl: sql`coalesce(${data.link || null}::text, ${candidates.linkUrl})`,
          lastActivityAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: candidates.id });

    const [existing] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.jobId, jobId), eq(applications.candidateId, candidate!.id)));

    if (existing) {
      await tx
        .update(applications)
        .set({ answers, message: data.message || null, consentAt: now, consentText: input.consentText, viewedAt: null })
        .where(eq(applications.id, existing.id));
      return { candidateId: candidate!.id, applicationId: existing.id, reapplied: true };
    }

    // New applications go on top of the first column.
    const [top] = await tx
      .select({ value: min(applications.position) })
      .from(applications)
      .where(eq(applications.stageId, firstStage.id));
    const [created] = await tx
      .insert(applications)
      .values({
        organizationId: orgId,
        candidateId: candidate!.id,
        jobId,
        stageId: firstStage.id,
        position: (top?.value ?? 1) - 1,
        source: "career_site",
        message: data.message || null,
        answers,
        consentAt: now,
        consentText: input.consentText,
      })
      .returning({ id: applications.id });
    return { candidateId: candidate!.id, applicationId: created!.id, reapplied: false };
  });

  await storeCv(orgId, candidateId, applicationId, input.cv);
  await logActivity(db, { orgId }, { candidateId, applicationId, jobId, type: reapplied ? "reapplied" : "applied" });
  await refreshSearchText(db, candidateId);
  try {
    await sendConfirmationEmail(orgId, applicationId);
  } catch (error) {
    console.error("[apply] confirmation email failed", error);
  }
  return { candidateId, applicationId, reapplied };
}
