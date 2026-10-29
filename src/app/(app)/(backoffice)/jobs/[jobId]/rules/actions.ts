"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, ok, type ActionResult } from "@/lib/actions";
import { requireContext } from "@/lib/context";
import {
  createRule,
  deleteRule,
  RULE_ACTIONS,
  RuleError,
  setRuleEnabled,
  updateRule,
  type RuleInput,
} from "@/lib/services/automations";

const ruleSchema = z.object({
  stageId: z.string().uuid(),
  delayMinutes: z.number().int(),
  condition: z.object({ questionId: z.string().uuid(), equals: z.string().max(200) }).nullable(),
  action: z.enum(RULE_ACTIONS),
  params: z
    .object({
      templateId: z.string().uuid().nullable().optional(),
      reason: z.string().max(60).optional(),
      userIds: z.array(z.string().max(100)).max(50).optional(),
      message: z.string().max(1000).optional(),
      tag: z.string().max(200).optional(),
      stageId: z.string().uuid().optional(),
      interviewerIds: z.array(z.string().max(100)).max(20).optional(),
      durationMinutes: z.number().int().optional(),
      locationKind: z.enum(["video", "onsite", "phone"]).optional(),
      location: z.string().max(1000).nullable().optional(),
    })
    .strip(),
});

function ruleFail(error: unknown) {
  if (error instanceof RuleError) return fail(`rules.errors.${error.reason}`);
  return failFrom(error);
}

export async function saveRuleAction(
  jobId: string,
  ruleId: string | null,
  input: RuleInput,
): Promise<ActionResult> {
  const ctx = await requireContext();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return fail("common.unknownError");
  try {
    if (ruleId) await updateRule(ctx, z.string().uuid().parse(ruleId), parsed.data);
    else await createRule(ctx, z.string().uuid().parse(jobId), parsed.data);
    revalidatePath(`/jobs/${jobId}`, "layout");
    return ok();
  } catch (error) {
    return ruleFail(error);
  }
}

export async function setRuleEnabledAction(
  jobId: string,
  ruleId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await setRuleEnabled(ctx, z.string().uuid().parse(ruleId), enabled === true);
    revalidatePath(`/jobs/${jobId}`, "layout");
    return ok();
  } catch (error) {
    return ruleFail(error);
  }
}

export async function deleteRuleAction(jobId: string, ruleId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await deleteRule(ctx, z.string().uuid().parse(ruleId));
    revalidatePath(`/jobs/${jobId}`, "layout");
    return ok();
  } catch (error) {
    return ruleFail(error);
  }
}
