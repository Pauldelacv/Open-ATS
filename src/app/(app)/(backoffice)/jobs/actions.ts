"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { fail, failFrom, fieldErrorsFrom, ok, type ActionResult } from "@/lib/actions";
import { requireContext } from "@/lib/context";
import type { JobStatus } from "@/lib/db/schema";
import {
  createJob,
  deleteDraftJob,
  duplicateJob,
  getJob,
  JobHasApplicationsError,
  saveStages,
  setJobStatus,
  StageError,
  updateJob,
} from "@/lib/services/jobs";
import { jobInputSchema, type JobInput } from "@/lib/validation/jobs";

export async function saveJobAction(
  jobId: string | null,
  input: JobInput,
  options: { publish?: boolean },
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireContext();
  const parsed = jobInputSchema.safeParse(input);
  if (!parsed.success) return fail("jobs.editor.fixErrors", fieldErrorsFrom(parsed.error.issues));
  try {
    if (jobId) {
      const job = await updateJob(ctx, jobId, input);
      if (options.publish && job.status !== "published") await setJobStatus(ctx, jobId, "published");
      revalidatePath("/jobs");
      return ok({ id: job.id });
    }
    const job = await createJob(ctx, input, options);
    revalidatePath("/jobs");
    return ok({ id: job.id });
  } catch (error) {
    return failFrom(error);
  }
}

export async function setJobStatusAction(jobId: string, status: JobStatus): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await setJobStatus(ctx, jobId, status);
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${jobId}`);
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function duplicateJobAction(jobId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireContext();
  try {
    const t = await getTranslations("jobs");
    const job = await getJob(ctx, jobId);
    const copy = await duplicateJob(ctx, jobId, t("copyTitle", { title: job.title }).slice(0, 150));
    revalidatePath("/jobs");
    return ok({ id: copy.id });
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteJobAction(jobId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await deleteDraftJob(ctx, jobId);
    revalidatePath("/jobs");
    return ok();
  } catch (error) {
    if (error instanceof JobHasApplicationsError) return fail("jobs.toasts.hasApplications");
    return failFrom(error);
  }
}

export async function saveStagesAction(jobId: string, stages: Array<{ id?: string; name: string }>): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await saveStages(ctx, jobId, stages);
    revalidatePath(`/jobs/${jobId}`);
    return ok();
  } catch (error) {
    if (error instanceof StageError) return fail("pipeline.stages.fixed");
    return failFrom(error);
  }
}
