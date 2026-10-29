import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  candidates,
  emailMessages,
  emailTemplates,
  files,
  jobs,
  organizations,
  user,
  type EmailTemplateKind,
} from "@/lib/db/schema";
import { replyMailbox } from "@/lib/env";
import { deliver, messageIdFor, textToHtml, type OutgoingMail } from "@/lib/mail";
import { assertCan, NotFoundError } from "@/lib/permissions";
import { candidateAccess } from "./access";
import { logActivity } from "./activity";
import { defaultTemplates } from "./default-templates";
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

/** First template of a kind, created from the defaults when the organisation has none. */
export async function ensureTemplate(orgId: string, kind: EmailTemplateKind) {
  const [existing] = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.organizationId, orgId), eq(emailTemplates.kind, kind)))
    .orderBy(asc(emailTemplates.createdAt))
    .limit(1);
  if (existing) return existing;
  const [org] = await db
    .select({ locale: organizations.locale })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  const fallback = defaultTemplates[org?.locale ?? "fr"].find((t) => t.kind === kind);
  if (!fallback) return null;
  const [created] = await db
    .insert(emailTemplates)
    .values({ organizationId: orgId, ...fallback })
    .returning();
  return created ?? null;
}

/* ---------------------------------- Sending --------------------------------- */

/** Message-ID of a received message of the candidate, to thread a reply. */
async function answeredMessage(ctx: Ctx, emailId: string, candidateId: string) {
  const [row] = await db
    .select({ messageId: emailMessages.messageId })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.id, emailId),
        eq(emailMessages.organizationId, ctx.orgId),
        eq(emailMessages.candidateId, candidateId),
      ),
    );
  return row?.messageId ?? null;
}

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
  input: {
    applicationIds: string[];
    subject: string;
    body: string;
    templateId?: string | null;
    /** Id of a received message this email answers (single recipient). */
    replyToMessageId?: string | null;
    /** Values of the variables that depend on the email (slot link, interview date…). */
    values?: TemplateValues;
    icalEvent?: OutgoingMail["icalEvent"];
  },
  options: {
    skipPermission?: boolean;
    /** Sent by Open ATS on someone's behalf (booking, rule): no sender, no actor. */
    automatic?: boolean;
  } = {},
) {
  if (!options.skipPermission) assertCan(ctx.role, "candidate:email");
  const automatic = options.automatic || Boolean(ctx.rule);
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
  const answered =
    input.replyToMessageId && list.length === 1
      ? await answeredMessage(ctx, input.replyToMessageId, list[0]!.candidateId)
      : null;
  const mailbox = replyMailbox();
  for (const r of list) {
    if (!r.email) {
      results.push({ applicationId: r.applicationId, status: "skipped" });
      continue;
    }
    const values = { ...valuesFor(r, org!.name, sender?.name ?? org!.name), ...input.values };
    const subject = renderTemplate(input.subject, values);
    const body = renderTemplate(input.body, values);
    const id = crypto.randomUUID();
    const messageId = messageIdFor(id);
    const result = await deliver({
      to: r.email,
      subject,
      text: body,
      html: textToHtml(body),
      fromName: org!.name,
      // Replies go to the shared mailbox when Open ATS reads it, otherwise to the sender.
      replyTo: mailbox ?? sender?.email,
      messageId,
      inReplyTo: answered ?? undefined,
      icalEvent: input.icalEvent,
    });
    await db.insert(emailMessages).values({
      id,
      messageId,
      inReplyTo: answered,
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
      sentById: automatic ? null : ctx.userId,
    });
    await logActivity(db, automatic ? { orgId: ctx.orgId, rule: ctx.rule } : ctx, {
      candidateId: r.candidateId,
      applicationId: r.applicationId,
      jobId: r.jobId,
      type: "email_sent",
      data: { subject, status: result.status, ...(automatic ? { automatic: true } : {}) },
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
  const id = crypto.randomUUID();
  const messageId = messageIdFor(id);
  const result = await deliver({
    to: r.email,
    subject,
    text: body,
    html: textToHtml(body),
    fromName: org.name,
    replyTo: replyMailbox() ?? undefined,
    messageId,
  });
  await db.insert(emailMessages).values({
    id,
    messageId,
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
  const rows = await db
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
    .where(
      and(eq(emailMessages.organizationId, ctx.orgId), eq(emailMessages.direction, "outbound")),
    )
    .orderBy(desc(emailMessages.createdAt))
    .limit(limit);
  // Only sent messages are journaled; received ones live in each candidate's conversation.
  return rows.map((r) => ({ ...r, status: r.status as Exclude<typeof r.status, "received"> }));
}

/** Emails sent to and received from a candidate, oldest first, with attachments. */
export async function listCandidateEmails(ctx: Ctx, candidateId: string) {
  const rows = await db
    .select({
      id: emailMessages.id,
      direction: emailMessages.direction,
      subject: emailMessages.subject,
      body: emailMessages.body,
      fullBody: emailMessages.fullBody,
      status: emailMessages.status,
      fromName: emailMessages.fromName,
      fromEmail: emailMessages.fromEmail,
      toEmail: emailMessages.toEmail,
      readAt: emailMessages.readAt,
      createdAt: emailMessages.createdAt,
      applicationId: emailMessages.applicationId,
      senderName: user.name,
    })
    .from(emailMessages)
    .leftJoin(user, eq(user.id, emailMessages.sentById))
    .where(
      and(
        eq(emailMessages.organizationId, ctx.orgId),
        eq(emailMessages.candidateId, candidateId),
        eq(emailMessages.category, "candidate"),
      ),
    )
    .orderBy(asc(emailMessages.createdAt));
  const ids = rows.filter((r) => r.direction === "inbound").map((r) => r.id);
  const attachments = ids.length
    ? await db
        .select({
          id: files.id,
          emailMessageId: files.emailMessageId,
          fileName: files.fileName,
          mimeType: files.mimeType,
          size: files.size,
        })
        .from(files)
        .where(and(eq(files.organizationId, ctx.orgId), inArray(files.emailMessageId, ids)))
    : [];
  return rows.map((r) => ({
    ...r,
    attachments: attachments.filter((a) => a.emailMessageId === r.id),
  }));
}

export type ConversationMessage = Awaited<ReturnType<typeof listCandidateEmails>>[number];

/** Received messages of a candidate count as read once someone opens the conversation. */
export async function markConversationRead(ctx: Ctx, candidateId: string) {
  await db
    .update(emailMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(emailMessages.organizationId, ctx.orgId),
        eq(emailMessages.candidateId, candidateId),
        eq(emailMessages.direction, "inbound"),
        isNull(emailMessages.readAt),
        candidateAccess(ctx, emailMessages.candidateId),
      ),
    );
}
