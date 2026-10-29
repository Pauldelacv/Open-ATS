"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { failFrom, ok, type ActionResult } from "@/lib/actions";
import { requireContext } from "@/lib/context";
import { setJobInFeeds } from "@/lib/services/distribution";

export async function setJobInFeedsAction(jobId: string, inFeeds: boolean): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await setJobInFeeds(ctx, z.string().uuid().parse(jobId), Boolean(inFeeds));
    revalidatePath(`/jobs/${jobId}/distribution`);
    return ok();
  } catch (error) {
    return failFrom(error);
  }
}
