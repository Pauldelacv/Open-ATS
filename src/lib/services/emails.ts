import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  candidates,
  emailMessages,
  emailTemplates,
  jobs,
  organizations,
  user,
  type EmailTemplateKind,
} from "@/lib/db/schema";
import { deliver, textToHtml } from "@/lib/mail";
import { assertCan, NotFoundError } from "@/lib/permissions";
import { logActivity } from "./activity";
import { renderTemplate, type TemplateValues } from "./template-render";
import type { Ctx } from "./types";

/* -------------------------------- Templates -------------------------------- */

export async function listTemplates(ctx: Ctx, kind?: EmailTemplateKind) {
  return db
    .select()
    .from(emailTemplates)
    .where(
      and(
        eq(emailTemplates.organizationId, ctx.orgId),
        kind ? eq(emailTemplates.kind, kind) : undefined,
      ),
    )
    .orderBy(asc(emailTemplates.kind), asc(emailTemplates.name));
}

export async function getTemplate(ctx: Ctx, id: string) {
  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.organizationId, ctx.orgId)));
  if (!template) throw new NotFoundError("Template");
  return template;
}

export type TemplateInput = {
  name: string;
  kind: EmailTemplateKind;
  subject: string;
  body: string;
};

export async function saveTemplate(ctx: Ctx, id: string | null, input: TemplateInput) {
  assertCan(ctx.role, "templates:manage");
  if (id) {
    const [row] = await db
      .update(emailTemplates)
      .set(input)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.organizationId, ctx.orgId)))
      .returning();
    if (!row) throw new NotFoundError("Template");
    return row;
  }
  const [row] = await db
    .insert(emailTemplates)
    .values({ ...input, organizationId: ctx.orgId })
    .returning();
  return row!;
}

export async function deleteTemplate(ctx: Ctx, id: string) {
  assertCan(ctx.role, "templates:manage");
  await db
    .delete(emailTemplates)
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.organizationId, ctx.orgId)));
}

/* ---------------------------------- Sending --------------------------------- */

type Recipient = {
  applicationId: string;
  candidateId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  jobId: string;
  jobTitle: string;
};

async function recipients(ctx: Ctx, applicationIds: string[]): Promise<Recipient[]> {
  if (applicationIds.length === 0) return [];
  return db
    .select({
      applicationId: applications.id,
      candidateId: candidates.id,
      email: candidates.email,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      jobId: jobs.id,
      jobTitle: jobs.title,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(eq(applications.organizationId, ctx.orgId), inArray(applications.id, applicationIds)),
    );
}

export function valuesFor(
  r: { firstName: string; lastName: string; jobTitle: string },
  company: string,
  recruiter: string,
): TemplateValues {
  return { firstName: r.firstName, lastName: r.lastName, job: r.jobTitle, company, recruiter };
}

/**
 * Renders and sends a subject/body pair to the candidates of the given applications.
 * Each message is journaled and appears in the candidates' activity.
 */
export async function sendCandidateEmails(
  ctx: Ctx,
  input: { applicationIds: string[]; subject: string; body: string; templateId?: string | null },
  options: { skipPermission?: boolean } = {},
) {
  if (!options.skipPermission) assertCan(ctx.role, "candidate:email");
  const list = await recipients(ctx, input.applicationIds);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const [sender] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, ctx.userId));
  const results: Array<{
    applicationId: string;
    status: "sent" | "logged" | "failed" | "skipped";
  }> = [];
  for (const r of list) {
    if (!r.email) {
      results.push({ applicationId: r.applicationId, status: "skipped" });
      continue;
    }
    const values = valuesFor(r, org!.name, sender?.name ?? org!.name);
    const subject = renderTemplate(input.subject, values);
    const body = renderTemplate(input.body, values);
    const result = await deliver({
      to: r.email,
      subject,
      text: body,
      html: textToHtml(body),
      fromName: org!.name,
      replyTo: sender?.email,
    });
    await db.insert(emailMessages).values({
      organizationId: ctx.orgId,
      category: "candidate",
      candidateId: r.candidateId,
      applicationId: r.applicationId,
      templateId: input.templateId ?? null,
      toEmail: r.email,
      subject,
      body,
      status: result.status,
      error: result.error,
      sentById: ctx.userId,
    });
    await logActivity(db, ctx, {
      candidateId: r.candidateId,
      applicationId: r.applicationId,
      jobId: r.jobId,
      type: "email_sent",
      data: { subject, status: result.status },
    });
    results.push({ applicationId: r.applicationId, status: result.status });
  }
  return results;
}

/** Automatic acknowledgement after an application on the career site. */
export async function sendConfirmationEmail(orgId: string, applicationId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org?.sendConfirmationEmail) return;
  const [template] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.organizationId, orgId), eq(emailTemplates.kind, "confirmation")))
    .orderBy(asc(emailTemplates.createdAt))
    .limit(1);
  if (!template) return;
  const [r] = await recipients({ orgId, userId: "", role: "admin" }, [applicationId]);
  if (!r?.email) return;
  const values = valuesFor(r, org.name, org.name);
  const subject = renderTemplate(template.subject, values);
  const body = renderTemplate(template.body, values);
  const result = await deliver({
    to: r.email,
    subject,
    text: body,
    html: textToHtml(body),
    fromName: org.name,
  });
  await db.insert(emailMessages).values({
    organizationId: orgId,
    category: "candidate",
    candidateId: r.candidateId,
    applicationId,
    templateId: template.id,
    toEmail: r.email,
    subject,
    body,
    status: result.status,
    error: result.error,
  });
  await logActivity(
    db,
    { orgId },
    {
      candidateId: r.candidateId,
      applicationId,
      jobId: r.jobId,
      type: "email_sent",
      data: { subject, status: result.status, automatic: true },
    },
  );
}

/* --------------------------------- Journal --------------------------------- */

export async function listEmailJournal(ctx: Ctx, limit = 100) {
  assertCan(ctx.role, "emails:journal");
  return db
    .select({
      id: emailMessages.id,
      category: emailMessages.category,
      toEmail: emailMessages.toEmail,
      subject: emailMessages.subject,
      body: emailMessages.body,
      status: emailMessages.status,
      error: emailMessages.error,
      createdAt: emailMessages.createdAt,
      candidateId: emailMessages.candidateId,
      senderName: user.name,
    })
    .from(emailMessages)
    .leftJoin(user, eq(user.id, emailMessages.sentById))
    .where(eq(emailMessages.organizationId, ctx.orgId))
    .orderBy(desc(emailMessages.createdAt))
    .limit(limit);
}

export async function listCandidateEmails(ctx: Ctx, candidateId: string) {
  return db
    .select({
      id: emailMessages.id,
      subject: emailMessages.subject,
      body: emailMessages.body,
      status: emailMessages.status,
      createdAt: emailMessages.createdAt,
      senderName: user.name,
    })
    .from(emailMessages)
    .leftJoin(user, eq(user.id, emailMessages.sentById))
    .where(
      and(eq(emailMessages.organizationId, ctx.orgId), eq(emailMessages.candidateId, candidateId)),
    )
    .orderBy(desc(emailMessages.createdAt));
}
