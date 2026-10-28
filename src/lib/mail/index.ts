import nodemailer, { type Transporter } from "nodemailer";
import { env, smtpConfigured } from "@/lib/env";

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  fromName?: string;
};

export type DeliveryResult = { status: "sent" | "logged" | "failed"; error?: string };

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const e = env();
  transporter = e.SMTP_URL
    ? nodemailer.createTransport(e.SMTP_URL)
    : nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: e.SMTP_PORT ?? 587,
        secure: e.SMTP_SECURE,
        auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      });
  return transporter;
}

/** "Name <address>" with the display name replaced, keeping the configured address. */
export function fromHeader(fromName?: string): string {
  const configured = env().MAIL_FROM;
  if (!fromName) return configured;
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured;
  return `${fromName.replace(/["<>]/g, "")} <${address}>`;
}

/**
 * Sends an email through SMTP when configured. Without SMTP the message is written to the
 * server log and reported as "logged", so the app stays usable on a fresh install.
 */
export async function deliver(mail: OutgoingMail): Promise<DeliveryResult> {
  if (!smtpConfigured()) {
    if (env().NODE_ENV !== "test") {
      console.info(
        [
          "[mail] SMTP not configured, email logged instead of sent",
          `  To: ${mail.to}`,
          `  Subject: ${mail.subject}`,
          ...mail.text.split("\n").map((line) => `  | ${line}`),
        ].join("\n"),
      );
    }
    return { status: "logged" };
  }
  try {
    await getTransporter().sendMail({
      from: fromHeader(mail.fromName),
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo,
    });
    return { status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mail] delivery failed", message);
    return { status: "failed", error: message };
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Minimal, readable HTML version of a plain-text email: paragraphs and line breaks. */
export function textToHtml(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#18233A;max-width:560px">${paragraphs}</div>`;
}
