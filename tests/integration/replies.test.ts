import { and, eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { activities, emailMessages, files, notifications } from "@/lib/db/schema";
import { renderCvPdf } from "@/lib/demo/cv";
import { pollMailbox } from "@/lib/mail/imap";
import { getApplicationDetail, listCvFiles } from "@/lib/services/candidates";
import {
  listCandidateEmails,
  markConversationRead,
  sendCandidateEmails,
} from "@/lib/services/emails";
import { anonymizeCandidate } from "@/lib/services/gdpr";
import { ingestInboundEmail } from "@/lib/services/inbound";
import { getBoard } from "@/lib/services/pipeline";
import { searchPool } from "@/lib/services/search";
import type { Ctx } from "@/lib/services/types";
import { apply, createTenant, publishedJob } from "../helpers";

type RawMail = {
  from: string;
  subject?: string;
  text: string;
  inReplyTo?: string;
  references?: string;
  messageId?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
};

function raw(mail: RawMail): Promise<Buffer> {
  return new MailComposer({
    to: "jobs@open-ats.test",
    subject: "Re: Votre candidature",
    messageId: mail.messageId ?? `<${crypto.randomUUID()}@candidate.test>`,
    ...mail,
  })
    .compile()
    .build();
}

async function sentMessageId(ctx: Ctx, applicationId: string) {
  await sendCandidateEmails(ctx, {
    applicationIds: [applicationId],
    subject: "Votre candidature",
    body: "Bonjour {{prénom}}, êtes-vous disponible jeudi ?",
  });
  const [sent] = await db
    .select({ messageId: emailMessages.messageId })
    .from(emailMessages)
    .where(eq(emailMessages.applicationId, applicationId))
    .orderBy(emailMessages.createdAt);
  return sent!.messageId!;
}

describe("candidate replies", () => {
  let ctx: Ctx;
  let other: Ctx;
  let job: { id: string };
  let app: { candidateId: string; applicationId: string };

  beforeAll(async () => {
    ctx = await createTenant("Réponses");
    other = await createTenant("Autre");
    job = await publishedJob(ctx, "Ébéniste");
    app = await apply(ctx, job.id, {
      firstName: "Marion",
      lastName: "Lefort",
      email: "marion.reply@example.test",
    });
  });

  it("gives every email to a candidate a Message-ID of ours", async () => {
    const id = await sentMessageId(ctx, app.applicationId);
    expect(id).toMatch(/^[0-9a-f-]{36}@localhost$/);
  });

  it("files a reply by its In-Reply-To, without the quoted text, and tells the sender", async () => {
    const answered = await sentMessageId(ctx, app.applicationId);
    const result = await ingestInboundEmail(
      await raw({
        from: "Marion Lefort <Marion.Reply@example.test>",
        inReplyTo: `<${answered}>`,
        references: `<${answered}>`,
        text: "Oui, jeudi 14 h me convient.\n\nLe jeu. 29 oct. 2026 à 10:00, Réponses a écrit :\n> Bonjour Marion",
      }),
    );
    expect(result.status).toBe("stored");
    if (result.status !== "stored") return;
    expect(result.organizationId).toBe(ctx.orgId);
    expect(result.candidateId).toBe(app.candidateId);

    const conversation = await listCandidateEmails(ctx, app.candidateId);
    const reply = conversation.at(-1)!;
    expect(reply.direction).toBe("inbound");
    expect(reply.body).toBe("Oui, jeudi 14 h me convient.");
    expect(reply.fullBody).toContain("> Bonjour Marion");
    expect(reply.fromEmail).toBe("marion.reply@example.test");
    expect(reply.readAt).toBeNull();

    const [note] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.type, "reply"), eq(notifications.emailMessageId, reply.id)));
    expect(note!.userId).toBe(ctx.userId);
    const [activity] = await db
      .select()
      .from(activities)
      .where(
        and(eq(activities.candidateId, app.candidateId), eq(activities.type, "email_received")),
      );
    expect(activity).toBeDefined();

    const board = await getBoard(ctx, job.id);
    expect(board.cards.find((c) => c.id === app.applicationId)!.unreadReplies).toBe(1);
    await markConversationRead(ctx, app.candidateId);
    const after = await getBoard(ctx, job.id);
    expect(after.cards.find((c) => c.id === app.applicationId)!.unreadReplies).toBe(0);

    const found = await searchPool(ctx, { q: "jeudi convient" });
    expect(found.rows.map((r) => r.id)).toContain(app.candidateId);
  });

  it("threads an answer from Open ATS to the received message", async () => {
    const conversation = await listCandidateEmails(ctx, app.candidateId);
    const received = conversation.find((m) => m.direction === "inbound")!;
    await sendCandidateEmails(ctx, {
      applicationIds: [app.applicationId],
      subject: "Re: Votre candidature",
      body: "Parfait, à jeudi.",
      replyToMessageId: received.id,
    });
    const [answer] = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.body, "Parfait, à jeudi."));
    const [inbound] = await db
      .select({ messageId: emailMessages.messageId })
      .from(emailMessages)
      .where(eq(emailMessages.id, received.id));
    expect(answer!.inReplyTo).toBe(inbound!.messageId);
  });

  it("falls back on the sender's address and ignores duplicates", async () => {
    const message = await raw({
      from: "marion.reply@example.test",
      messageId: "<fallback-1@candidate.test>",
      text: "Je vous envoie mon portfolio.",
    });
    expect((await ingestInboundEmail(message)).status).toBe("stored");
    expect((await ingestInboundEmail(message)).status).toBe("duplicate");
  });

  it("leaves unknown senders, automatic replies and our own messages aside", async () => {
    expect(
      (await ingestInboundEmail(await raw({ from: "stranger@example.test", text: "Bonjour" })))
        .status,
    ).toBe("unmatched");
    expect(
      (
        await ingestInboundEmail(
          await raw({
            from: "marion.reply@example.test",
            text: "Je suis absente jusqu'au 3 novembre.",
            headers: { "Auto-Submitted": "auto-replied" },
          }),
        )
      ).status,
    ).toBe("ignored");
    expect(
      (await ingestInboundEmail(await raw({ from: "no-reply@localhost", text: "Boucle" }))).status,
    ).toBe("ignored");
  });

  it("stores documents as attachments, not as CVs", async () => {
    const pdf = await renderCvPdf({
      name: "Marion Lefort",
      headline: "Portfolio",
      email: "marion.reply@example.test",
      phone: "",
      city: "Lyon",
      summary: "Projets de mobilier",
      experience: [],
      education: [],
      skills: [],
      languages: [],
      labels: { experience: "", education: "", skills: "", languages: "" },
    });
    const result = await ingestInboundEmail(
      await raw({
        from: "marion.reply@example.test",
        text: "Voici le document.",
        attachments: [
          { filename: "portfolio.pdf", content: pdf, contentType: "application/pdf" },
          {
            filename: "script.exe",
            content: Buffer.from("MZ"),
            contentType: "application/x-msdownload",
          },
        ],
      }),
    );
    expect(result.status).toBe("stored");
    if (result.status !== "stored") return;
    const conversation = await listCandidateEmails(ctx, app.candidateId);
    const message = conversation.find((m) => m.id === result.emailId)!;
    expect(message.attachments.map((a) => a.fileName)).toEqual(["portfolio.pdf"]);
    const cvs = await listCvFiles(ctx, app.candidateId);
    expect(cvs.every((f) => f.fileName !== "portfolio.pdf")).toBe(true);
    const detail = await getApplicationDetail(ctx, app.applicationId);
    expect(detail.emails.some((m) => m.attachments.length === 1)).toBe(true);
  });

  it("goes to the organisation that wrote to the candidate last", async () => {
    const otherJob = await publishedJob(other, "Designer");
    const theirs = await apply(other, otherJob.id, {
      firstName: "Marion",
      lastName: "Lefort",
      email: "marion.reply@example.test",
    });
    await sentMessageId(other, theirs.applicationId);
    const result = await ingestInboundEmail(
      await raw({ from: "marion.reply@example.test", text: "Merci pour votre message." }),
    );
    expect(result.status === "stored" && result.organizationId).toBe(other.orgId);
    expect((await listCandidateEmails(other, app.candidateId)).length).toBe(0);
    await markConversationRead(other, app.candidateId);
    const mine = await listCandidateEmails(ctx, app.candidateId);
    expect(mine.some((m) => m.body === "Merci pour votre message.")).toBe(false);
  });

  it("removes received messages and attachments when the candidate is anonymised", async () => {
    await anonymizeCandidate(ctx.orgId, app.candidateId);
    expect(await listCandidateEmails(ctx, app.candidateId)).toEqual([]);
    const left = await db.select().from(files).where(eq(files.candidateId, app.candidateId));
    expect(left).toEqual([]);
  });
});

describe.runIf(process.env.IMAP_HOST)("mailbox reader", () => {
  it("reads new messages once and remembers where it stopped", async () => {
    const ctx = await createTenant("Boîte");
    const job = await publishedJob(ctx, "Tapissier");
    const app = await apply(ctx, job.id, {
      firstName: "Hugo",
      lastName: "Bernard",
      email: "hugo.imap@example.test",
    });
    const answered = await sentMessageId(ctx, app.applicationId);
    await pollMailbox();
    const transport = nodemailer.createTransport({
      host: process.env.IMAP_HOST,
      port: Number(process.env.TEST_SMTP_PORT ?? 3025),
      secure: false,
    });
    await transport.sendMail({
      from: "hugo.imap@example.test",
      to: "jobs@open-ats.test",
      subject: "Re: Votre candidature",
      text: "Bonjour, je confirme ma venue.",
      inReplyTo: `<${answered}>`,
    });
    const first = await pollMailbox();
    expect(first.stored).toBe(1);
    const second = await pollMailbox();
    expect(second.fetched).toBe(0);
    const conversation = await listCandidateEmails(ctx, app.candidateId);
    expect(conversation.at(-1)!.body).toBe("Bonjour, je confirme ma venue.");
  });
});
