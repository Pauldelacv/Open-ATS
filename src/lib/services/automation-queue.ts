import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { automationRules, automationRuns } from "@/lib/db/schema";
import type { Ctx } from "./types";

/** Rules started by rules (moves) stop after this many levels, so two rules cannot loop. */
export const MAX_RULE_DEPTH = 3;

/** « At once » still waits a minute, which leaves time to undo a move by mistake. */
export const MIN_RULE_DELAY_MS = 60_000;

export function ruleDueAt(enteredAt: Date, delayMinutes: number) {
  return new Date(enteredAt.getTime() + Math.max(delayMinutes * 60_000, MIN_RULE_DELAY_MS));
}

/** Both sides at millisecond precision: dates read back in JavaScript lose the microseconds. */
export const sameStay = (left: unknown, right: unknown) =>
  sql`date_trunc('milliseconds', ${left}) = date_trunc('milliseconds', ${right})`;

/**
 * Plans the enabled rules of the stages that applications just entered. Returns how many
 * distinct rules will apply, for the message shown after a move.
 */
export async function enqueueStageRules(
  executor: Tx | typeof db,
  ctx: Pick<Ctx, "orgId" | "rule">,
  entries: Array<{ applicationId: string; stageId: string; enteredAt: Date }>,
): Promise<number> {
  if (entries.length === 0) return 0;
  const depth = ctx.rule ? ctx.rule.depth + 1 : 0;
  if (depth > MAX_RULE_DEPTH) return 0;
  const rules = await executor
    .select({
      id: automationRules.id,
      stageId: automationRules.stageId,
      delayMinutes: automationRules.delayMinutes,
    })
    .from(automationRules)
    .where(
      and(
        eq(automationRules.organizationId, ctx.orgId),
        eq(automationRules.enabled, true),
        inArray(automationRules.stageId, [...new Set(entries.map((e) => e.stageId))]),
      ),
    );
  if (rules.length === 0) return 0;
  const values = entries.flatMap((entry) =>
    rules
      .filter((rule) => rule.stageId === entry.stageId)
      .map((rule) => ({
        organizationId: ctx.orgId,
        ruleId: rule.id,
        applicationId: entry.applicationId,
        stageEnteredAt: entry.enteredAt,
        dueAt: ruleDueAt(entry.enteredAt, rule.delayMinutes),
        depth,
      })),
  );
  if (values.length > 0) await executor.insert(automationRuns).values(values).onConflictDoNothing();
  return new Set(values.map((v) => v.ruleId)).size;
}
