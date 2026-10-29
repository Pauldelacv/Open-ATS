import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { db } from "@/lib/db";
import {
  applications,
  candidates,
  emailMessages,
  files,
  jobMembers,
  memberships,
  notifications,
  organizations,
  user,
} from "@/lib/db/schema";
import { appUrl, env, replyMailbox } from "@/lib/env";
import { extractCvText } from "@/lib/cv-text";
import { serverTranslator } from "@/i18n/server";
import { deliver, textToHtml } from "@/lib/mail";
import {
  isAutomaticReply,
  messageIdList,
  normalizeMessageId,
  stripQuotedText,
} from "@/lib/mail/reply";
import { richTextToPlain } from "@/lib/sanitize";
import { storage } from "@/lib/storage";
import { sha256 } from "@/lib/utils/crypto";
import { logActivity } from "./activity";
import { refreshSearchText } from "./search-index";

export type IngestResult =
  | { status: "stored"; organizationId: string; candidateId: string; emailId: string }
  | { status: "duplicate" | "unmatched" | "ignored"; reason?: string };

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/rtf": "rtf",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function firstAddress(value: AddressObject | AddressObject[] | undefined) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  for (const group of list)
    for (const entry of group.value)
      if (entry.address) return { address: entry.address.toLowerCase(), name: entry.name || null };
  return null;
}

/** Addresses of our own messages: never treat them as a candidate writing to us. */
function ownAddresses(): Set<string> {
  const e = env();
  const from = e.MAIL_FROM.match(/<([^>]+)>/)?.[1] ?? e.MAIL_FROM;
  return new Set(
    [from, replyMailbox(), e.IMAP_USER].filter(Boolean).map((a) => String(a).toLowerCase()),
  );
}

type Match = {
  organizationId: string;
  candidateId: string;
  applicationId: string | null;
  answeredBy: string | null;
  /** When the answered email was sent: a reply is never shown before it. */
  answeredAt: Date | null;
};

/** The conversation a received message belongs to. */
async function matchMessage(references: string[], from: string): Promise<Match | null> {
  if (references.length > 0) {
    const [sent] = await db
      .select({
        id: emailMessages.id,
        organizationId: emailMessages.organizationId,
        candidateId: emailMessages.candidateId,
        applicationId: emailMessages.applicationId,
        sentById: emailMessages.sentById,
        createdAt: emailMessages.createdAt,
      })
      .from(emailMessages)
      .where(
        and(
          inArray(emailMessages.messageId, references),
          eq(emailMessages.direction, "outbound"),
          eq(emailMessages.category, "candidate"),
        ),
      )
      .orderBy(desc(emailMessages.createdAt))
      .limit(1);
    if (sent?.candidateId) {
      return {
        organizationId: sent.organizationId,
        candidateId: sent.candidateId,
        applicationId: sent.applicationId,
        answeredBy: sent.sentById,
        answeredAt: sent.createdAt,
      };
    }
  }

  // No known reference: the sender's address, in the organisation that wrote to them last.
  const people = await db
    .select({
      id: candidates.id,
      organizationId: candidates.organizationId,
      lastActivityAt: candidates.lastActivityAt,
    })
    .from(candidates)
    .where(and(eq(candidates.email, from), isNull(candidates.anonymizedAt)));
  if (people.length === 0) return null;
  const [lastSent] = await db
    .select({
      candidateId: emailMessages.candidateId,
      applicationId: emailMessages.applicationId,
      sentById: emailMessages.sentById,
      createdAt: emailMessages.createdAt,
    })
    .from(emailMessages)
    .where(
      and(
        inArray(
          emailMessages.candidateId,
          people.map((p) => p.id),
        ),
        eq(emailMessages.direction, "outbound"),
      ),
    )
    .orderBy(desc(emailMessages.createdAt))
    .limit(1);
  const person =
    people.find((p) => p.id === lastSent?.candidateId) ??
    [...people].sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime())[0]!;
  let applicationId = lastSent?.candidateId === person.id ? lastSent.applicationId : null;
  if (!applicationId) {
    const [latest] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.candidateId, person.id))
      .orderBy(desc(applications.updatedAt))
      .limit(1);
    applicationId = latest?.id ?? null;
  }
  return {
    organizationId: person.organizationId,
    candidateId: person.id,
    applicationId,
    answeredBy: lastSent?.candidateId === person.id ? lastSent.sentById : null,
    answeredAt: lastSent?.candidateId === person.id ? lastSent.createdAt : null,
  };
}

function plainText(parsed: ParsedMail): string {
  if (parsed.text?.trim()) return parsed.text;
  if (typeof parsed.html === "string") return richTextToPlain(parsed.html);
  return "";
}

async function storeAttachments(
  parsed: ParsedMail,
  match: Match,
  emailId: string,
): Promise<number> {
  let stored = 0;
  for (const attachment of parsed.attachments) {
    if (stored >= MAX_ATTACHMENTS) break;
    const extension = ATTACHMENT_TYPES[attachment.contentType.toLowerCase()];
    // Inline images of signatures are not documents.
    if (!extension || attachment.related || attachment.size > MAX_ATTACHMENT_BYTES) continue;
    const fileId = crypto.randomUUID();
    const key = `org/${match.organizationId}/candidates/${match.candidateId}/mail/${fileId}.${extension}`;
    await storage().put(key, attachment.content, attachment.contentType);
    const textContent =
      extension === "pdf" || extension === "docx"
        ? await extractCvText(extension, attachment.content).catch(() => "")
        : "";
    const fileName =
      (attachment.filename ?? `piece-jointe.${extension}`).replace(/[\\/\0]/g, "_").slice(0, 200) ||
      `piece-jointe.${extension}`;
    await db.insert(files).values({
      id: fileId,
      organizationId: match.organizationId,
      candidateId: match.candidateId,
      applicationId: match.applicationId,
      emailMessageId: emailId,
      kind: "attachment",
      storageKey: key,
      fileName,
      mimeType: attachment.contentType,
      size: attachment.size,
      textContent,
    });
    stored++;
  }
  return stored;
}

/** People told about a reply: who sent the answered email, else the job's team, else recruiters. */
async function replyRecipients(match: Match): Promise<string[]> {
  const team = await db
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.organizationId, match.organizationId));
  const members = new Set(team.map((m) => m.userId));
  if (match.answeredBy && members.has(match.answeredBy)) return [match.answeredBy];
  if (match.applicationId) {
    const assigned = await db
      .select({ userId: jobMembers.userId })
      .from(jobMembers)
      .innerJoin(applications, eq(applications.jobId, jobMembers.jobId))
      .where(eq(applications.id, match.applicationId));
    const managers = assigned
      .map((a) => a.userId)
      .filter((id) => team.find((m) => m.userId === id && m.role !== "member"));
    if (managers.length > 0) return managers;
  }
  return team.filter((m) => m.role !== "member").map((m) => m.userId);
}

async function notifyReply(
  match: Match,
  emailId: string,
  candidate: { firstName: string; lastName: string },
  excerpt: string,
) {
  const recipients = await replyRecipients(match);
  if (recipients.length === 0) return;
  await db.insert(notifications).values(
    recipients.map((userId) => ({
      organizationId: match.organizationId,
      userId,
      type: "reply" as const,
      emailMessageId: emailId,
      candidateId: match.candidateId,
      applicationId: match.applicationId,
    })),
  );
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, match.organizationId));
  const [app] = match.applicationId
    ? await db
        .select({ jobId: applications.jobId })
        .from(applications)
        .where(eq(applications.id, match.applicationId))
    : [];
  const url = appUrl(
    app ? `/jobs/${app.jobId}?a=${match.applicationId}` : `/candidates/${match.candidateId}`,
  );
  const people = await db
    .select({ email: user.email, locale: user.locale })
    .from(user)
    .where(inArray(user.id, recipients));
  const name = `${candidate.firstName} ${candidate.lastName}`;
  for (const person of people) {
    const t = serverTranslator(person.locale === "en" ? "en" : "fr", "emails.reply");
    const subject = t("subject", { candidate: name });
    const text = t("body", { candidate: name, excerpt, url });
    const result = await deliver({
      to: person.email,
      subject,
      text,
      html: textToHtml(text),
      fromName: org?.name,
    });
    await db.insert(emailMessages).values({
      organizationId: match.organizationId,
      category: "team",
      toEmail: person.email,
      subject,
      body: text,
      status: result.status,
      error: result.error,
    });
  }
}

/**
 * Files a received email in the conversation of the candidate who sent it. Messages that
 * match nobody, automatic replies and our own messages are left aside.
 */
export async function ingestInboundEmail(raw: Buffer): Promise<IngestResult> {
  const parsed = await simpleParser(raw, { skipImageLinks: true });
  if (isAutomaticReply(parsed.headers)) return { status: "ignored", reason: "automatic" };
  const sender = firstAddress(parsed.from);
  if (!sender) return { status: "ignored", reason: "no-sender" };
  if (ownAddresses().has(sender.address)) return { status: "ignored", reason: "own" };

  const references = messageIdList(parsed.inReplyTo, parsed.references);
  const match = await matchMessage(references, sender.address);
  if (!match) return { status: "unmatched" };

  const messageId =
    normalizeMessageId(parsed.messageId) ?? `sha256-${sha256(raw.toString("binary"))}`;
  const [existing] = await db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, match.organizationId),
        eq(emailMessages.messageId, messageId),
      ),
    );
  if (existing) return { status: "duplicate" };

  const [candidate] = await db
    .select({ firstName: candidates.firstName, lastName: candidates.lastName })
    .from(candidates)
    .where(eq(candidates.id, match.candidateId));
  const full = plainText(parsed).trim().slice(0, 100_000);
  const { body, quoted } = stripQuotedText(full);
  // The Date header has no milliseconds and clocks drift: keep replies after what they answer.
  let receivedAt =
    parsed.date && Math.abs(parsed.date.getTime() - Date.now()) < 30 * 86_400_000
      ? parsed.date
      : new Date();
  if (match.answeredAt && receivedAt <= match.answeredAt)
    receivedAt = new Date(match.answeredAt.getTime() + 1000);

  const [row] = await db
    .insert(emailMessages)
    .values({
      organizationId: match.organizationId,
      category: "candidate",
      direction: "inbound",
      candidateId: match.candidateId,
      applicationId: match.applicationId,
      toEmail: replyMailbox() ?? firstAddress(parsed.to)?.address ?? "",
      fromEmail: sender.address,
      fromName: sender.name,
      subject: (parsed.subject ?? "").slice(0, 500),
      body: body.slice(0, 20_000),
      fullBody: quoted ? full : null,
      status: "received",
      messageId,
      inReplyTo: references[0] ?? null,
      createdAt: receivedAt,
    })
    .onConflictDoNothing()
    .returning({ id: emailMessages.id });
  if (!row) return { status: "duplicate" };

  await storeAttachments(parsed, match, row.id);
  await db
    .update(candidates)
    .set({ lastActivityAt: new Date() })
    .where(eq(candidates.id, match.candidateId));
  const [app] = match.applicationId
    ? await db
        .select({ jobId: applications.jobId })
        .from(applications)
        .where(eq(applications.id, match.applicationId))
    : [];
  await logActivity(
    db,
    { orgId: match.organizationId },
    {
      candidateId: match.candidateId,
      applicationId: match.applicationId,
      jobId: app?.jobId ?? null,
      type: "email_received",
      data: { subject: (parsed.subject ?? "").slice(0, 200) },
    },
  );
  await refreshSearchText(db, match.candidateId);
  try {
    await notifyReply(match, row.id, candidate!, body.slice(0, 500));
  } catch (error) {
    console.error("[mail] reply notification failed", error);
  }
  return {
    status: "stored",
    organizationId: match.organizationId,
    candidateId: match.candidateId,
    emailId: row.id,
  };
}
