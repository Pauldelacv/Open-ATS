"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, ok, type ActionResult } from "@/lib/actions";
import { requireContext } from "@/lib/context";
import { sendCandidateEmails } from "@/lib/services/emails";
import { moveApplications, restorePositions } from "@/lib/services/pipeline";
import { rejectApplications, rejectionReasons } from "@/lib/services/rejections";
import { addNote, deleteNote, saveEvaluation } from "@/lib/services/candidates";
import { addTag, removeTag } from "@/lib/services/tags";

type Position = { id: string; stageId: string; position: number };

const ids = z.array(z.string().uuid()).min(1).max(500);

export async function moveApplicationsAction(
  applicationIds: string[],
  stageId: string,
  index: number,
): Promise<ActionResult<Position[]>> {
  const ctx = await requireContext();
  try {
    const previous = await moveApplications(
      ctx,
      ids.parse(applicationIds),
      z.string().uuid().parse(stageId),
      Math.max(0, Math.floor(index)),
    );
    revalidatePath("/jobs");
    return ok(previous);
  } catch (error) {
    return failFrom(error);
  }
}

export async function undoMoveAction(previous: Position[]): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await restorePositions(
      ctx,
      z
        .array(
          z.object({ id: z.string().uuid(), stageId: z.string().uuid(), position: z.number() }),
        )
        .parse(previous),
    );
    revalidatePath("/jobs");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

const emailSchema = z.object({
  subject: z.string().trim().min(1, "emailComposer.errors.subject").max(300),
  body: z.string().trim().min(1, "emailComposer.errors.body").max(20_000),
  templateId: z.string().uuid().nullable().optional(),
});

export async function rejectAction(
  applicationIds: string[],
  input: {
    reason: string;
    email: { subject: string; body: string; templateId?: string | null } | null;
  },
): Promise<ActionResult<{ rejected: number; statuses: string[] }>> {
  const ctx = await requireContext();
  const reason = z.enum(rejectionReasons).safeParse(input.reason);
  if (!reason.success) return fail("common.unknownError");
  const email = input.email ? emailSchema.safeParse(input.email) : null;
  if (email && !email.success)
    return fail("form", {
      [String(email.error.issues[0]?.path[0])]: email.error.issues[0]!.message,
    });
  try {
    const result = await rejectApplications(ctx, ids.parse(applicationIds), {
      reason: reason.data,
      email: email?.data ?? null,
    });
    revalidatePath("/jobs");
    return ok({ rejected: result.rejected, statuses: result.emails.map((e) => e.status) });
  } catch (error) {
    return failFrom(error);
  }
}

export async function sendEmailAction(
  applicationIds: string[],
  input: { subject: string; body: string; templateId?: string | null },
): Promise<ActionResult<{ statuses: string[] }>> {
  const ctx = await requireContext();
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success)
    return fail("form", {
      [String(parsed.error.issues[0]?.path[0])]: parsed.error.issues[0]!.message,
    });
  try {
    const results = await sendCandidateEmails(ctx, {
      applicationIds: ids.parse(applicationIds),
      ...parsed.data,
    });
    return ok({ statuses: results.map((r) => r.status) });
  } catch (error) {
    return failFrom(error);
  }
}

export async function addTagAction(
  candidateIds: string[],
  name: string,
): Promise<ActionResult<{ id: string; name: string } | null>> {
  const ctx = await requireContext();
  try {
    const tag = await addTag(
      ctx,
      ids.parse(candidateIds),
      z.string().trim().min(1).max(40).parse(name),
    );
    return ok(tag ? { id: tag.id, name: tag.name } : null);
  } catch (error) {
    return failFrom(error);
  }
}

export async function removeTagAction(candidateId: string, tagId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await removeTag(ctx, z.string().uuid().parse(candidateId), z.string().uuid().parse(tagId));
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function addNoteAction(input: {
  candidateId: string;
  applicationId: string | null;
  body: string;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  const body = z.string().trim().min(1, "panel.notes.empty").max(10_000).safeParse(input.body);
  if (!body.success) return fail("panel.notes.empty");
  try {
    await addNote(ctx, {
      candidateId: z.string().uuid().parse(input.candidateId),
      applicationId: input.applicationId,
      body: body.data,
    });
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function deleteNoteAction(noteId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await deleteNote(ctx, z.string().uuid().parse(noteId));
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}

export async function saveEvaluationAction(input: {
  applicationId: string;
  rating: number;
  comment: string;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  const parsed = z
    .object({
      applicationId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(5000),
    })
    .safeParse(input);
  if (!parsed.success) return fail("panel.evaluations.ratingRequired");
  try {
    await saveEvaluation(ctx, parsed.data);
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}
