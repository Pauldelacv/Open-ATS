import { and, asc, eq, gt, inArray, lt, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  automationRules,
  automationRuns,
  candidates,
  emailMessages,
  emailTemplates,
  interviews,
  jobQuestions,
  jobs,
  memberships,
  notifications,
  organizations,
  pipelineStages,
  slotProposals,
  user,
  type ApplicationAnswer,
  type LocationKind,
  type RuleAction,
  type RuleCondition,
  type RuleParams,
} from "@/lib/db/schema";
import { timeZone } from "@/i18n/config";
import { serverTranslator } from "@/i18n/server";
import { appUrl, env, videoMeetingBase } from "@/lib/env";
import { deliver, textToHtml } from "@/lib/mail";
import { assertCan, NotFoundError } from "@/lib/permissions";
import { addDays, zonedDate } from "@/lib/time/zoned";
import { getAccessibleJob } from "./access";
import { logActivity } from "./activity";
import { ruleDueAt, sameStay } from "./automation-queue";
import { sendCandidateEmails } from "./emails";
import { DURATIONS, findSlots, proposeSlots } from "./interviews";
import { moveApplications } from "./pipeline";
import { rejectApplications, rejectionReasons, type RejectionReason } from "./rejections";
import { addTag } from "./tags";
import { usesSchedulingVariables, usesVariable } from "./template-render";
import type { Ctx } from "./types";

export const RULE_ACTIONS = [
  "email",
  "reject",
  "notify",
  "tag",
  "move",
  "propose_slots",
] as const satisfies readonly RuleAction[];

const LOCATION_KINDS = ["video", "onsite", "phone"] as const satisfies readonly LocationKind[];

/** Ninety days, the longest delay offered. */
export const MAX_RULE_DELAY_MINUTES = 90 * 24 * 60;

const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 5 * 60_000;
// A run still « running » after this long belongs to a process that stopped.
const STUCK_AFTER_MS = 10 * 60_000;

export class RuleError extends Error {
  constructor(
    public readonly reason:
      | "stage"
      | "delay"
      | "condition"
      | "action"
      | "template"
      | "templateVariables"
      | "slotsLink"
      | "reason"
      | "people"
      | "tag"
      | "target"
      | "duration"
      | "link"
      | "slots"
      | "send",
  ) {
    super(`Rule error: ${reason}`);
    this.name = "RuleError";
  }
}

export type RuleInput = {
  stageId: string;
  delayMinutes: number;
  condition: RuleCondition | null;
  action: RuleAction;
  params: RuleParams;
};

/* -------------------------------- Validation -------------------------------- */

async function orgTemplate(orgId: string, templateId: string | null | undefined) {
  if (!templateId) return null;
  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, templateId), eq(emailTemplates.organizationId, orgId)));
  return template ?? null;
}

async function orgMembers(orgId: string, userIds: unknown) {
  const ids = Array.isArray(userIds) ? userIds.filter((id) => typeof id === "string") : [];
  if (ids.length === 0) return [];
  return db
    .select({ id: user.id, name: user.name, email: user.email, locale: user.locale })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.organizationId, orgId), inArray(memberships.userId, ids)));
}

/** Checks a rule against its job and keeps only the settings its action reads. */
async function cleanRule(ctx: Ctx, jobId: string, input: RuleInput) {
  const stages = await db
    .select()
    .from(pipelineStages)
    .where(and(eq(pipelineStages.jobId, jobId), eq(pipelineStages.organizationId, ctx.orgId)));
  const stage = stages.find((s) => s.id === input.stageId);
  if (!stage) throw new RuleError("stage");
  const delay = Number(input.delayMinutes);
  if (!Number.isInteger(delay) || delay < 0 || delay > MAX_RULE_DELAY_MINUTES)
    throw new RuleError("delay");

  let condition: RuleCondition | null = null;
  if (input.condition) {
    const [question] = await db
      .select()
      .from(jobQuestions)
      .where(and(eq(jobQuestions.id, input.condition.questionId), eq(jobQuestions.jobId, jobId)));
    const equals = String(input.condition.equals ?? "");
    const valid =
      question &&
      ((question.type === "yes_no" && (equals === "yes" || equals === "no")) ||
        (question.type === "single_choice" && question.options.includes(equals)));
    if (!valid) throw new RuleError("condition");
    condition = { questionId: question.id, equals };
  }

  const p = input.params ?? {};
  let params: RuleParams;
  switch (input.action) {
    case "email": {
      const template = await orgTemplate(ctx.orgId, p.templateId);
      if (!template) throw new RuleError("template");
      if (usesSchedulingVariables(`${template.subject}\n${template.body}`))
        throw new RuleError("templateVariables");
      params = { templateId: template.id };
      break;
    }
    case "reject": {
      if (stage.kind === "rejected") throw new RuleError("action");
      if (!rejectionReasons.includes(p.reason as RejectionReason)) throw new RuleError("reason");
      const template = p.templateId ? await orgTemplate(ctx.orgId, p.templateId) : null;
      if (p.templateId && !template) throw new RuleError("template");
      if (template && usesSchedulingVariables(`${template.subject}\n${template.body}`))
        throw new RuleError("templateVariables");
      params = { reason: p.reason, templateId: template?.id ?? null };
      break;
    }
    case "notify": {
      const people = await orgMembers(ctx.orgId, p.userIds);
      if (people.length === 0) throw new RuleError("people");
      params = {
        userIds: people.map((person) => person.id),
        message: (p.message ?? "").trim().slice(0, 300),
      };
      break;
    }
    case "tag": {
      const tag = (p.tag ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!tag) throw new RuleError("tag");
      params = { tag };
      break;
    }
    case "move": {
      const target = stages.find((s) => s.id === p.stageId);
      // Rejections need a reason: the « reject » action is the way to the rejected stage.
      if (!target || target.id === stage.id || target.kind === "rejected")
        throw new RuleError("target");
      params = { stageId: target.id };
      break;
    }
    case "propose_slots": {
      if (stage.kind === "rejected") throw new RuleError("action");
      const people = await orgMembers(ctx.orgId, p.interviewerIds);
      if (people.length === 0) throw new RuleError("people");
      if (!DURATIONS.includes(p.durationMinutes as (typeof DURATIONS)[number]))
        throw new RuleError("duration");
      const locationKind = LOCATION_KINDS.find((k) => k === p.locationKind);
      if (!locationKind) throw new RuleError("link");
      const location = (p.location ?? "").trim().slice(0, 500) || null;
      if (locationKind === "video" && location && !/^https?:\/\//i.test(location))
        throw new RuleError("link");
      const template = await orgTemplate(ctx.orgId, p.templateId);
      if (!template) throw new RuleError("template");
      if (!usesVariable(`${template.subject}\n${template.body}`, "slotsLink"))
        throw new RuleError("slotsLink");
      params = {
        interviewerIds: people.map((person) => person.id),
        durationMinutes: p.durationMinutes,
        locationKind,
        location,
        templateId: template.id,
      };
      break;
    }
    default:
      throw new RuleError("action");
  }
  return { stageId: stage.id, delayMinutes: delay, condition, action: input.action, params };
}

/* ----------------------------------- CRUD ----------------------------------- */

export async function listRules(ctx: Ctx, jobId: string) {
  assertCan(ctx.role, "job:manage");
  await getAccessibleJob(ctx, jobId);
  const rules = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.jobId, jobId), eq(automationRules.organizationId, ctx.orgId)))
    .orderBy(asc(automationRules.position), asc(automationRules.createdAt));
  if (rules.length === 0) return [];
  const ids = rules.map((r) => r.id);
  const stats = await db
    .select({
      ruleId: automationRuns.ruleId,
      done: sql<number>`count(*) filter (where ${automationRuns.status} = 'done')::int`,
      failed: sql<number>`count(*) filter (where ${automationRuns.status} = 'failed')::int`,
      // Only runs whose application is still in the same stay will happen.
      pending: sql<number>`count(*) filter (where ${automationRuns.status} in ('pending', 'running') and ${applications.stageId} = ${automationRules.stageId} and ${sameStay(applications.stageChangedAt, automationRuns.stageEnteredAt)})::int`,
      lastDoneAt: sql<Date | null>`max(${automationRuns.finishedAt}) filter (where ${automationRuns.status} = 'done')`,
    })
    .from(automationRuns)
    .innerJoin(automationRules, eq(automationRules.id, automationRuns.ruleId))
    .innerJoin(applications, eq(applications.id, automationRuns.applicationId))
    .where(inArray(automationRuns.ruleId, ids))
    .groupBy(automationRuns.ruleId);
  const failures = await db
    .selectDistinctOn([automationRuns.ruleId], {
      ruleId: automationRuns.ruleId,
      error: automationRuns.error,
      at: automationRuns.finishedAt,
    })
    .from(automationRuns)
    .where(and(inArray(automationRuns.ruleId, ids), eq(automationRuns.status, "failed")))
    .orderBy(automationRuns.ruleId, sql`${automationRuns.finishedAt} desc`);
  return rules.map((rule) => {
    const s = stats.find((x) => x.ruleId === rule.id);
    const f = failures.find((x) => x.ruleId === rule.id);
    return {
      id: rule.id,
      stageId: rule.stageId,
      delayMinutes: rule.delayMinutes,
      condition: rule.condition,
      action: rule.action,
      params: rule.params,
      enabled: rule.enabled,
      done: s?.done ?? 0,
      pending: s?.pending ?? 0,
      failed: s?.failed ?? 0,
      lastDoneAt: s?.lastDoneAt ? new Date(s.lastDoneAt).toISOString() : null,
      lastFailure: f ? { reason: f.error, at: f.at?.toISOString() ?? null } : null,
    };
  });
}

export type RuleRow = Awaited<ReturnType<typeof listRules>>[number];

/** Enabled rules per stage of a job, for the board's column headers. */
export async function ruleCountsByStage(ctx: Pick<Ctx, "orgId">, jobId: string) {
  const rows = await db
    .select({ stageId: automationRules.stageId, total: sql<number>`count(*)::int` })
    .from(automationRules)
    .where(
      and(
        eq(automationRules.jobId, jobId),
        eq(automationRules.organizationId, ctx.orgId),
        eq(automationRules.enabled, true),
      ),
    )
    .groupBy(automationRules.stageId);
  return new Map(rows.map((r) => [r.stageId, r.total]));
}

async function ownRule(ctx: Ctx, ruleId: string) {
  assertCan(ctx.role, "job:manage");
  const [rule] = await db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.id, ruleId), eq(automationRules.organizationId, ctx.orgId)));
  if (!rule) throw new NotFoundError("Rule");
  await getAccessibleJob(ctx, rule.jobId);
  return rule;
}

/** A new rule only applies to applications that arrive in its stage from now on. */
export async function createRule(ctx: Ctx, jobId: string, input: RuleInput) {
  assertCan(ctx.role, "job:manage");
  await getAccessibleJob(ctx, jobId);
  const values = await cleanRule(ctx, jobId, input);
  const [last] = await db
    .select({ position: max(automationRules.position) })
    .from(automationRules)
    .where(eq(automationRules.stageId, values.stageId));
  const [rule] = await db
    .insert(automationRules)
    .values({
      ...values,
      organizationId: ctx.orgId,
      jobId,
      position: (last?.position ?? -1) + 1,
      createdById: ctx.userId,
    })
    .returning();
  return rule!;
}

export async function updateRule(ctx: Ctx, ruleId: string, input: RuleInput) {
  const rule = await ownRule(ctx, ruleId);
  const values = await cleanRule(ctx, rule.jobId, input);
  await db.transaction(async (tx) => {
    await tx.update(automationRules).set(values).where(eq(automationRules.id, rule.id));
    if (values.stageId !== rule.stageId) {
      // Planned runs belonged to the previous stage.
      await tx
        .update(automationRuns)
        .set({ status: "cancelled", finishedAt: new Date() })
        .where(and(eq(automationRuns.ruleId, rule.id), eq(automationRuns.status, "pending")));
    } else if (values.delayMinutes !== rule.delayMinutes) {
      await tx
        .update(automationRuns)
        .set({
          dueAt: sql`${automationRuns.stageEnteredAt} + make_interval(secs => ${
            Math.max(values.delayMinutes, 1) * 60
          })`,
        })
        .where(and(eq(automationRuns.ruleId, rule.id), eq(automationRuns.status, "pending")));
    }
  });
}

/** Turning a rule off drops what it had planned; turning it on does not catch up. */
export async function setRuleEnabled(ctx: Ctx, ruleId: string, enabled: boolean) {
  const rule = await ownRule(ctx, ruleId);
  await db.transaction(async (tx) => {
    await tx.update(automationRules).set({ enabled }).where(eq(automationRules.id, rule.id));
    if (!enabled)
      await tx
        .update(automationRuns)
        .set({ status: "cancelled", finishedAt: new Date() })
        .where(and(eq(automationRuns.ruleId, rule.id), eq(automationRuns.status, "pending")));
  });
}

export async function deleteRule(ctx: Ctx, ruleId: string) {
  const rule = await ownRule(ctx, ruleId);
  await db.delete(automationRules).where(eq(automationRules.id, rule.id));
}

/* --------------------------------- Execution -------------------------------- */

/** Reasons a planned run does not happen; it is not an error. */
class SkipRun extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "SkipRun";
  }
}

export function conditionHolds(condition: RuleCondition | null, answers: ApplicationAnswer[]) {
  if (!condition) return true;
  return answers.some((a) => a.questionId === condition.questionId && a.value === condition.equals);
}

/**
 * Rules act as their author (sender name and reply address of emails), or as an admin once
 * the author has left; activities record no actor.
 */
async function ruleContext(
  rule: { id: string; organizationId: string; createdById: string | null },
  depth: number,
): Promise<Ctx> {
  const team = await db
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.organizationId, rule.organizationId))
    .orderBy(asc(memberships.createdAt));
  const author = team.find((m) => m.userId === rule.createdById && m.role !== "member");
  const acting = author ?? team.find((m) => m.role === "admin") ?? team[0];
  if (!acting) throw new RuleError("people");
  return {
    orgId: rule.organizationId,
    userId: acting.userId,
    role: "admin",
    rule: { id: rule.id, depth },
  };
}

type RunTarget = {
  applicationId: string;
  candidateId: string;
  jobId: string;
  jobTitle: string;
  stageName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  rejected: boolean;
};

async function notifyPeople(ctx: Ctx, rule: { id: string; params: RuleParams }, target: RunTarget) {
  const people = await orgMembers(ctx.orgId, rule.params.userIds);
  if (people.length === 0) throw new RuleError("people");
  const message = rule.params.message?.trim() || null;
  await db.insert(notifications).values(
    people.map((person) => ({
      organizationId: ctx.orgId,
      userId: person.id,
      type: "rule" as const,
      ruleId: rule.id,
      message,
      candidateId: target.candidateId,
      applicationId: target.applicationId,
    })),
  );
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId));
  const url = appUrl(`/jobs/${target.jobId}?a=${target.applicationId}`);
  const candidate = `${target.firstName} ${target.lastName}`;
  for (const person of people) {
    const t = serverTranslator(person.locale === "en" ? "en" : "fr", "emails.rule");
    const values = { candidate, job: target.jobTitle, stage: target.stageName, url };
    const subject = t("subject", { candidate });
    const text = t("body", { ...values, message: message ?? t("defaultMessage", values) });
    const result = await deliver({
      to: person.email,
      subject,
      text,
      html: textToHtml(text),
      fromName: org?.name,
    });
    await db.insert(emailMessages).values({
      organizationId: ctx.orgId,
      category: "team",
      toEmail: person.email,
      subject,
      body: text,
      status: result.status,
      error: result.error,
    });
  }
}

async function proposeFromRule(ctx: Ctx, params: RuleParams, target: RunTarget) {
  if (!target.email) throw new SkipRun("no-email");
  const now = new Date();
  const [open] = await db
    .select({ id: slotProposals.id })
    .from(slotProposals)
    .where(
      and(eq(slotProposals.applicationId, target.applicationId), eq(slotProposals.status, "open")),
    )
    .limit(1);
  const [upcoming] = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(
      and(
        eq(interviews.applicationId, target.applicationId),
        eq(interviews.status, "scheduled"),
        gt(interviews.endsAt, now),
      ),
    )
    .limit(1);
  if (open || upcoming) throw new SkipRun("already");
  const template = await orgTemplate(ctx.orgId, params.templateId);
  if (!template) throw new RuleError("template");
  const zone = timeZone();
  const from = addDays(zonedDate(now, zone), 1);
  const found = await findSlots(ctx, {
    applicationId: target.applicationId,
    interviewerIds: params.interviewerIds ?? [],
    durationMinutes: params.durationMinutes ?? 0,
    from,
    to: addDays(from, 13),
  });
  if (found.suggested.length === 0) throw new RuleError("slots");
  let location = params.location ?? null;
  if (params.locationKind === "video" && !location) {
    const base = videoMeetingBase();
    location =
      found.interviewers.find((i) => i.meetingUrl)?.meetingUrl ??
      (base ? `${base}/${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}` : null);
  }
  await proposeSlots(ctx, {
    applicationId: target.applicationId,
    interviewerIds: params.interviewerIds ?? [],
    durationMinutes: params.durationMinutes ?? 0,
    slots: found.suggested.map((s) => s.start),
    locationKind: params.locationKind ?? "video",
    location,
    email: { subject: template.subject, body: template.body, templateId: template.id },
  });
}

async function performAction(
  ctx: Ctx,
  rule: { id: string; action: RuleAction; params: RuleParams },
  target: RunTarget,
) {
  const params = rule.params;
  switch (rule.action) {
    case "email": {
      const template = await orgTemplate(ctx.orgId, params.templateId);
      if (!template) throw new RuleError("template");
      if (!target.email) throw new SkipRun("no-email");
      const [result] = await sendCandidateEmails(
        ctx,
        {
          applicationIds: [target.applicationId],
          subject: template.subject,
          body: template.body,
          templateId: template.id,
        },
        { skipPermission: true },
      );
      if (result?.status === "failed") throw new RuleError("send");
      return;
    }
    case "reject": {
      if (target.rejected) throw new SkipRun("rejected");
      const template = params.templateId ? await orgTemplate(ctx.orgId, params.templateId) : null;
      if (params.templateId && !template) throw new RuleError("template");
      await rejectApplications(ctx, [target.applicationId], {
        reason: params.reason as RejectionReason,
        email:
          template && target.email
            ? { subject: template.subject, body: template.body, templateId: template.id }
            : null,
      });
      return;
    }
    case "notify":
      return notifyPeople(ctx, rule, target);
    case "tag":
      await addTag(ctx, [target.candidateId], params.tag ?? "");
      return;
    case "move": {
      const [stage] = await db
        .select({ id: pipelineStages.id })
        .from(pipelineStages)
        .where(
          and(eq(pipelineStages.id, params.stageId ?? ""), eq(pipelineStages.jobId, target.jobId)),
        );
      if (!stage) throw new RuleError("target");
      await moveApplications(ctx, [target.applicationId], stage.id, 0);
      return;
    }
    case "propose_slots":
      return proposeFromRule(ctx, params, target);
  }
}

type RunOutcome = "done" | "skipped" | "failed" | "retried" | "waiting";

async function executeRun(runId: string, now: Date): Promise<RunOutcome> {
  const [row] = await db
    .select({
      run: automationRuns,
      rule: automationRules,
      stageId: applications.stageId,
      stageChangedAt: applications.stageChangedAt,
      answers: applications.answers,
      rejectedAt: applications.rejectedAt,
      candidateId: applications.candidateId,
      jobId: applications.jobId,
      jobTitle: jobs.title,
      stageName: pipelineStages.name,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      anonymizedAt: candidates.anonymizedAt,
    })
    .from(automationRuns)
    .innerJoin(automationRules, eq(automationRules.id, automationRuns.ruleId))
    .innerJoin(applications, eq(applications.id, automationRuns.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(pipelineStages, eq(pipelineStages.id, automationRules.stageId))
    .where(eq(automationRuns.id, runId));
  if (!row) return "skipped";
  const { run, rule } = row;
  const finish = (status: "done" | "skipped" | "failed", error: string | null = null) =>
    db
      .update(automationRuns)
      .set({ status, error, finishedAt: new Date() })
      .where(eq(automationRuns.id, run.id));

  try {
    if (!rule.enabled) throw new SkipRun("disabled");
    if (
      row.stageId !== rule.stageId ||
      row.stageChangedAt.getTime() !== run.stageEnteredAt.getTime()
    )
      throw new SkipRun("moved");
    if (row.anonymizedAt) throw new SkipRun("anonymized");
    // The delay may have been lengthened since the run was planned.
    const due = ruleDueAt(run.stageEnteredAt, rule.delayMinutes);
    if (due > now) {
      await db
        .update(automationRuns)
        .set({ status: "pending", dueAt: due, attempts: sql`${automationRuns.attempts} - 1` })
        .where(eq(automationRuns.id, run.id));
      return "waiting";
    }
    if (!conditionHolds(rule.condition, row.answers)) throw new SkipRun("condition");
    const ctx = await ruleContext(rule, run.depth);
    await performAction(ctx, rule, {
      applicationId: run.applicationId,
      candidateId: row.candidateId,
      jobId: row.jobId,
      jobTitle: row.jobTitle,
      stageName: row.stageName,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      rejected: row.rejectedAt !== null,
    });
    await finish("done");
    return "done";
  } catch (error) {
    if (error instanceof SkipRun) {
      await finish("skipped", error.reason);
      return "skipped";
    }
    const reason =
      error instanceof RuleError
        ? error.reason
        : (error instanceof Error ? error.message : String(error)).slice(0, 500);
    if (!(error instanceof RuleError) && run.attempts < MAX_ATTEMPTS) {
      await db
        .update(automationRuns)
        .set({
          status: "pending",
          error: reason,
          dueAt: new Date(now.getTime() + RETRY_AFTER_MS * run.attempts),
        })
        .where(eq(automationRuns.id, run.id));
      return "retried";
    }
    console.error(`[rules] rule ${rule.id} failed for application ${run.applicationId}`, error);
    await finish("failed", reason);
    await logActivity(
      db,
      { orgId: rule.organizationId, rule: { id: rule.id, depth: run.depth } },
      {
        candidateId: row.candidateId,
        applicationId: run.applicationId,
        jobId: row.jobId,
        type: "rule_failed",
        data: { action: rule.action, reason },
      },
    );
    return "failed";
  }
}

/**
 * Runs the rules that are due. Several processes can call it at once: each run is claimed by
 * one of them (`skip locked`).
 */
export async function runDueRules(options: { limit?: number; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 25;
  await db
    .update(automationRuns)
    .set({ status: "pending" })
    .where(
      and(
        eq(automationRuns.status, "running"),
        lt(automationRuns.startedAt, new Date(Date.now() - STUCK_AFTER_MS)),
      ),
    );
  const claimed = await db.execute<{ id: string }>(sql`
    update ${automationRuns}
    set status = 'running', attempts = attempts + 1, started_at = now()
    where id in (
      select id from ${automationRuns}
      where status = 'pending' and due_at <= ${now.toISOString()}::timestamptz
      order by due_at
      limit ${limit}
      for update skip locked
    )
    returning id`);
  const result: Record<RunOutcome, number> = {
    done: 0,
    skipped: 0,
    failed: 0,
    retried: 0,
    waiting: 0,
  };
  for (const { id } of claimed) result[await executeRun(id, now)]++;
  return result;
}

const globalForRules = globalThis as unknown as { __openAtsRules?: NodeJS.Timeout };

/** Runs due rules shortly after start-up, then every AUTOMATION_POLL_SECONDS. */
export function scheduleRules() {
  if (globalForRules.__openAtsRules) return;
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      const result = await runDueRules();
      if (result.done + result.failed > 0)
        console.info(`[rules] ${result.done} applied, ${result.failed} failed`);
    } catch (error) {
      console.error("[rules] run failed", error);
    } finally {
      busy = false;
    }
  };
  setTimeout(run, 15_000).unref();
  globalForRules.__openAtsRules = setInterval(run, env().AUTOMATION_POLL_SECONDS * 1000);
  globalForRules.__openAtsRules.unref();
}
