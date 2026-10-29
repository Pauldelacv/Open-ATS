import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  activities,
  applications,
  automationRuns,
  candidateTags,
  emailMessages,
  emailTemplates,
  notifications,
  pipelineStages,
  slotProposals,
} from "@/lib/db/schema";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import {
  createRule,
  listRules,
  RuleError,
  runDueRules,
  setRuleEnabled,
  updateRule,
  type RuleInput,
} from "@/lib/services/automations";
import { ensureTemplate } from "@/lib/services/emails";
import { createJob, duplicateJob, getJob, listStages } from "@/lib/services/jobs";
import { moveApplications, restorePositions } from "@/lib/services/pipeline";
import type { Ctx } from "@/lib/services/types";
import { addMember, apply, createTenant } from "../helpers";

const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

async function stageOf(applicationId: string) {
  const [row] = await db
    .select({ stageId: applications.stageId, rejectionReason: applications.rejectionReason })
    .from(applications)
    .where(eq(applications.id, applicationId));
  return row!;
}

async function runsOf(applicationId: string) {
  return db.select().from(automationRuns).where(eq(automationRuns.applicationId, applicationId));
}

describe("automatic rules", () => {
  let ctx: Ctx;
  let member: Ctx;
  let recruiter: Ctx;
  let other: Ctx;
  let job: Awaited<ReturnType<typeof getJob>>;
  let stages: Awaited<ReturnType<typeof listStages>>;
  let question: { id: string; label: string };
  let rejection: { id: string };
  let n = 0;

  const stage = (name: string) => stages.find((s) => s.name === name)!;
  const candidate = (answer?: "yes" | "no") =>
    apply(
      ctx,
      job.id,
      {
        firstName: "Camille",
        lastName: `Règle ${++n}`,
        email: `rule${n}@example.test`,
        answers: answer ? { [question.id]: answer } : {},
      },
      undefined,
      {
        questions: [
          { id: question.id, label: question.label, type: "yes_no", options: [], required: false },
        ],
      },
    );
  const rule = (input: Partial<RuleInput> & Pick<RuleInput, "action" | "params">) =>
    createRule(ctx, job.id, {
      stageId: stages[0]!.id,
      delayMinutes: 0,
      condition: null,
      ...input,
    });

  beforeAll(async () => {
    ctx = await createTenant("Règles");
    other = await createTenant("Ailleurs");
    member = await addMember(ctx, "member", "Manager");
    recruiter = await addMember(ctx, "recruiter", "Hugo Recruteur");
    const created = await createJob(
      ctx,
      {
        title: "Développeur",
        descriptionHtml: "<p>Description</p>",
        questions: [
          { label: "Avez-vous déjà travaillé avec PostgreSQL ?", type: "yes_no", required: false },
          { label: "Disponibilité", type: "short_text", required: false },
        ],
      },
      { publish: true },
    );
    job = await getJob(ctx, created.id);
    stages = await listStages(ctx, job.id);
    question = job.questions.find((q) => q.type === "yes_no")!;
    const [template] = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(
        and(eq(emailTemplates.organizationId, ctx.orgId), eq(emailTemplates.kind, "rejection")),
      );
    rejection = template!;
  });

  it("rejects after the delay when the answer matches, and only then", async () => {
    const knockout = await rule({
      delayMinutes: 2 * 24 * 60,
      condition: { questionId: question.id, equals: "no" },
      action: "reject",
      params: { reason: "experience", templateId: rejection.id },
    });
    const no = await candidate("no");
    const yes = await candidate("yes");
    expect((await runsOf(no.applicationId)).map((r) => r.status)).toEqual(["pending"]);

    // Not due yet.
    await runDueRules({ now: later(60) });
    expect((await runsOf(no.applicationId))[0]!.status).toBe("pending");

    const result = await runDueRules({ now: later(2 * 24 * 60 + 2) });
    expect(result.done).toBeGreaterThanOrEqual(1);
    const rejected = await stageOf(no.applicationId);
    expect(rejected.stageId).toBe(stages.find((s) => s.kind === "rejected")!.id);
    expect(rejected.rejectionReason).toBe("experience");
    expect((await runsOf(yes.applicationId))[0]).toMatchObject({
      status: "skipped",
      error: "condition",
    });
    expect((await stageOf(yes.applicationId)).stageId).toBe(stages[0]!.id);

    // The history says a rule did it, with no person as the actor.
    const history = await db
      .select()
      .from(activities)
      .where(eq(activities.applicationId, no.applicationId));
    const rejectedEvent = history.find((h) => h.type === "rejected")!;
    expect(rejectedEvent.actorId).toBeNull();
    expect(rejectedEvent.data.rule).toBe(true);
    const [mail] = await db
      .select()
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.applicationId, no.applicationId),
          eq(emailMessages.templateId, rejection.id),
        ),
      );
    expect(mail?.sentById).toBeNull();

    const [listed] = (await listRules(ctx, job.id)).filter((r) => r.id === knockout.id);
    expect(listed).toMatchObject({ done: 1, pending: 0, failed: 0 });
    await setRuleEnabled(ctx, knockout.id, false);
  });

  it("plans the rules of the stage a card is moved to, and undo brings back the stay", async () => {
    const tagRule = await rule({
      delayMinutes: 24 * 60,
      action: "tag",
      params: { tag: "Relancé" },
    });
    const notify = await createRule(ctx, job.id, {
      stageId: stage("Entretien").id,
      delayMinutes: 60,
      condition: null,
      action: "notify",
      params: { userIds: [recruiter.userId], message: "Préparer l'entretien" },
    });
    const app = await candidate();
    const moved = await moveApplications(ctx, [app.applicationId], stage("Entretien").id, 0);
    expect(moved.rules).toBe(1);
    await restorePositions(ctx, moved.previous);

    await runDueRules({ now: later(25 * 60) });
    const runs = await runsOf(app.applicationId);
    // Back in the first stage: its reminder still happens, the interview stage's does not.
    expect(runs.find((r) => r.ruleId === tagRule.id)?.status).toBe("done");
    expect(runs.find((r) => r.ruleId === notify.id)).toMatchObject({
      status: "skipped",
      error: "moved",
    });
    const tagged = await db
      .select()
      .from(candidateTags)
      .where(eq(candidateTags.candidateId, app.candidateId));
    expect(tagged).toHaveLength(1);
    await setRuleEnabled(ctx, tagRule.id, false);

    // Moved for good, the reminder reaches the recruiter in the app and by email.
    await moveApplications(ctx, [app.applicationId], stage("Entretien").id, 0);
    await runDueRules({ now: later(90) });
    const [note] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, recruiter.userId), eq(notifications.ruleId, notify.id)));
    expect(note).toMatchObject({ type: "rule", message: "Préparer l'entretien" });
    const teamMails = await db
      .select()
      .from(emailMessages)
      .where(and(eq(emailMessages.organizationId, ctx.orgId), eq(emailMessages.category, "team")));
    expect(teamMails.some((m) => m.body.includes("Préparer l'entretien"))).toBe(true);
    await setRuleEnabled(ctx, notify.id, false);
  });

  it("stops chains of moves after a few levels", async () => {
    const screening = stage("Présélection");
    const interview = stage("Entretien");
    const forth = await createRule(ctx, job.id, {
      stageId: screening.id,
      delayMinutes: 0,
      condition: null,
      action: "move",
      params: { stageId: interview.id },
    });
    const back = await createRule(ctx, job.id, {
      stageId: interview.id,
      delayMinutes: 0,
      condition: null,
      action: "move",
      params: { stageId: screening.id },
    });
    const app = await candidate();
    await moveApplications(ctx, [app.applicationId], screening.id, 0);
    for (let i = 0; i < 6; i++) await runDueRules({ now: later(5) });
    const runs = (await runsOf(app.applicationId)).filter(
      (r) => r.ruleId === forth.id || r.ruleId === back.id,
    );
    expect(runs.map((r) => r.depth).sort()).toEqual([0, 1, 2, 3]);
    expect(runs.every((r) => r.status === "done")).toBe(true);
    expect((await stageOf(app.applicationId)).stageId).toBe(screening.id);
    await setRuleEnabled(ctx, forth.id, false);
    await setRuleEnabled(ctx, back.id, false);
  });

  it("pausing cancels planned runs and a longer delay pushes them back", async () => {
    const email = await rule({
      delayMinutes: 60,
      action: "email",
      params: { templateId: rejection.id },
    });
    const app = await candidate();
    await updateRule(ctx, email.id, {
      stageId: stages[0]!.id,
      delayMinutes: 3 * 60,
      condition: null,
      action: "email",
      params: { templateId: rejection.id },
    });
    const [run] = (await runsOf(app.applicationId)).filter((r) => r.ruleId === email.id);
    expect(run!.dueAt.getTime() - run!.stageEnteredAt.getTime()).toBe(3 * 3600_000);
    await runDueRules({ now: later(90) });
    expect((await runsOf(app.applicationId)).find((r) => r.ruleId === email.id)?.status).toBe(
      "pending",
    );
    await setRuleEnabled(ctx, email.id, false);
    expect((await runsOf(app.applicationId)).find((r) => r.ruleId === email.id)?.status).toBe(
      "cancelled",
    );
  });

  it("records a failure in the rule and the candidate's history", async () => {
    const [template] = await db
      .insert(emailTemplates)
      .values({ organizationId: ctx.orgId, name: "Éphémère", subject: "Bonjour", body: "Texte" })
      .returning();
    const email = await rule({ action: "email", params: { templateId: template!.id } });
    const app = await candidate();
    await db.delete(emailTemplates).where(eq(emailTemplates.id, template!.id));
    await runDueRules({ now: later(5) });
    expect((await runsOf(app.applicationId)).find((r) => r.ruleId === email.id)).toMatchObject({
      status: "failed",
      error: "template",
    });
    const [listed] = (await listRules(ctx, job.id)).filter((r) => r.id === email.id);
    expect(listed!.lastFailure?.reason).toBe("template");
    const history = await db
      .select()
      .from(activities)
      .where(
        and(eq(activities.applicationId, app.applicationId), eq(activities.type, "rule_failed")),
      );
    expect(history).toHaveLength(1);
    await setRuleEnabled(ctx, email.id, false);
  });

  it("offers interview slots from the interviewers' free time", async () => {
    const slots = await ensureTemplate(ctx.orgId, "slots");
    const offer = await createRule(ctx, job.id, {
      stageId: stage("Entretien").id,
      delayMinutes: 0,
      condition: null,
      action: "propose_slots",
      params: {
        interviewerIds: [recruiter.userId],
        durationMinutes: 45,
        locationKind: "phone",
        templateId: slots!.id,
      },
    });
    const app = await candidate();
    await moveApplications(ctx, [app.applicationId], stage("Entretien").id, 0);
    await runDueRules({ now: later(5) });
    const [proposal] = await db
      .select()
      .from(slotProposals)
      .where(eq(slotProposals.applicationId, app.applicationId));
    expect(proposal?.status).toBe("open");
    expect(proposal!.slots.length).toBeGreaterThan(0);
    expect(proposal!.slots.length).toBeLessThanOrEqual(6);
    expect(proposal!.interviewerIds).toEqual([recruiter.userId]);
    const [mail] = await db
      .select()
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.applicationId, app.applicationId),
          eq(emailMessages.templateId, slots!.id),
        ),
      );
    expect(mail!.body).toMatch(/\/interview\//);
    await setRuleEnabled(ctx, offer.id, false);
  });

  it("runs each planned action once when two workers run together", async () => {
    const tagRule = await rule({ action: "tag", params: { tag: "Parallèle" } });
    const apps = await Promise.all([candidate(), candidate(), candidate(), candidate()]);
    const [a, b] = await Promise.all([
      runDueRules({ now: later(5) }),
      runDueRules({ now: later(5) }),
    ]);
    const runs = await db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.ruleId, tagRule.id));
    expect(runs).toHaveLength(apps.length);
    expect(runs.every((r) => r.status === "done" && r.attempts === 1)).toBe(true);
    expect(a.done + b.done).toBeGreaterThanOrEqual(apps.length);
    await setRuleEnabled(ctx, tagRule.id, false);
  });

  it("refuses rules that cannot work and people who may not edit them", async () => {
    const rejected = stages.find((s) => s.kind === "rejected")!;
    const short = job.questions.find((q) => q.type === "short_text")!;
    const [plain] = await db
      .insert(emailTemplates)
      .values({ organizationId: ctx.orgId, name: "Sans lien", subject: "Hello", body: "Texte" })
      .returning();
    const slotsTemplate = await ensureTemplate(ctx.orgId, "slots");
    const cases: Array<[Partial<RuleInput> & Pick<RuleInput, "action" | "params">, string]> = [
      [{ stageId: rejected.id, action: "reject", params: { reason: "other" } }, "action"],
      [{ action: "move", params: { stageId: rejected.id } }, "target"],
      [{ action: "move", params: { stageId: stages[0]!.id } }, "target"],
      [
        {
          condition: { questionId: short.id, equals: "demain" },
          action: "tag",
          params: { tag: "x" },
        },
        "condition",
      ],
      [{ delayMinutes: 200 * 24 * 60, action: "tag", params: { tag: "x" } }, "delay"],
      [{ action: "notify", params: { userIds: [other.userId] } }, "people"],
      [{ action: "email", params: { templateId: slotsTemplate!.id } }, "templateVariables"],
      [
        {
          action: "propose_slots",
          params: {
            interviewerIds: [ctx.userId],
            durationMinutes: 45,
            locationKind: "video",
            templateId: plain!.id,
          },
        },
        "slotsLink",
      ],
    ];
    for (const [input, reason] of cases) {
      await expect(rule(input)).rejects.toMatchObject({ name: "RuleError", reason });
    }
    await expect(rule({ action: "tag", params: { tag: "" } })).rejects.toBeInstanceOf(RuleError);
    await expect(
      createRule(member, job.id, {
        stageId: stages[0]!.id,
        delayMinutes: 0,
        condition: null,
        action: "tag",
        params: { tag: "x" },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listRules(other, job.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("copies stages and rules when a job is duplicated", async () => {
    await createRule(ctx, job.id, {
      stageId: stage("Offre").id,
      delayMinutes: 5 * 24 * 60,
      condition: { questionId: question.id, equals: "yes" },
      action: "move",
      params: { stageId: stage("Entretien").id },
    });
    const copy = await duplicateJob(ctx, job.id, "Développeur (copie)");
    const copiedStages = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.jobId, copy.id));
    expect(copiedStages.map((s) => s.name).sort()).toEqual(stages.map((s) => s.name).sort());
    const rules = await listRules(ctx, copy.id);
    const original = await listRules(ctx, job.id);
    expect(rules).toHaveLength(original.length);
    const moved = rules.find((r) => r.delayMinutes === 5 * 24 * 60)!;
    const copiedJob = await getJob(ctx, copy.id);
    expect(copiedStages.some((s) => s.id === moved.stageId)).toBe(true);
    expect(copiedStages.find((s) => s.id === moved.params.stageId)?.name).toBe("Entretien");
    expect(moved.condition?.questionId).toBe(
      copiedJob.questions.find((q) => q.type === "yes_no")!.id,
    );
    expect(rules.every((r) => r.done === 0)).toBe(true);
  });
});
