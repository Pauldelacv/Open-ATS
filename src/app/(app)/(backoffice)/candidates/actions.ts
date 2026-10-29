"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failFrom, ok, type ActionResult } from "@/lib/actions";
import { requireContext } from "@/lib/context";
import { deleteCandidate } from "@/lib/services/gdpr";

export async function deleteCandidateAction(candidateId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await deleteCandidate(ctx, z.string().uuid().parse(candidateId));
    revalidatePath("/candidates");
    revalidatePath("/jobs");
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}
