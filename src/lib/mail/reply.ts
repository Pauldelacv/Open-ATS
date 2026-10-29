/** Helpers to read candidates' replies: message ids, automatic replies, quoted text. */

/** `<abc@host>` → `abc@host`. Message-IDs are compared as written, without brackets. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const inBrackets = trimmed.match(/<([^<>\s]+)>/);
  const id = inBrackets ? inBrackets[1]! : trimmed;
  return id && !/\s/.test(id) ? id : null;
}

function extractIds(value: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  return parts.flatMap((part) =>
    (part.match(/<[^<>\s]+>/g) ?? [part])
      .map((raw) => normalizeMessageId(raw))
      .filter((id): id is string => Boolean(id)),
  );
}

/**
 * Message-IDs a reply refers to, the most relevant first: `In-Reply-To`, then `References`
 * from the most recent (that header lists the thread oldest first).
 */
export function messageIdList(
  inReplyTo: string | string[] | null | undefined,
  references: string | string[] | null | undefined,
): string[] {
  const ids: string[] = [];
  for (const id of [...extractIds(inReplyTo), ...extractIds(references).reverse()])
    if (!ids.includes(id)) ids.push(id);
  return ids;
}

type HeaderValue = string | string[] | { value?: string } | undefined | null;

function headerText(value: HeaderValue): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(" ");
  if (typeof value === "object") return value.value ?? "";
  return String(value);
}

/** Out-of-office answers, delivery reports and mailing-list traffic. */
export function isAutomaticReply(headers: Map<string, unknown>, contentType?: string): boolean {
  const get = (name: string) => headerText(headers.get(name) as HeaderValue).toLowerCase();
  const autoSubmitted = get("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (headers.has("x-autoreply") || headers.has("x-autorespond")) return true;
  if (/^(bulk|junk|list|auto_reply)$/.test(get("precedence").trim())) return true;
  if (headers.has("list-id") || headers.has("list-unsubscribe")) return true;
  const type = (contentType ?? get("content-type")).toLowerCase();
  return type.startsWith("multipart/report");
}

// Lines that start the quoted part of a reply in common mail clients (French and English).
const REPLY_HEADER = [
  /^(on|le)\s.+\s(wrote|a écrit)\s?:\s*$/i,
  /^-{2,}\s*(original message|message d'origine)\s*-{2,}\s*$/i,
  /^_{8,}\s*$/,
];
const OUTLOOK_FIELD = /^(de|from)\s?:\s.+/i;
const OUTLOOK_NEXT = /^(envoyé|sent|date|à|to|objet|subject)\s?:/i;

/**
 * Separates what the candidate wrote from the message they answered. Returns the new text
 * and whether something was removed; when nothing new is left, the whole text is kept.
 */
export function stripQuotedText(text: string): { body: string; quoted: boolean } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let cut = -1;
  for (let i = 0; i < lines.length && cut === -1; i++) {
    const line = lines[i]!.trim();
    const joined = `${line} ${lines[i + 1]?.trim() ?? ""}`.trim();
    if (REPLY_HEADER.some((p) => p.test(line))) cut = i;
    else if (/^(on|le)\s/i.test(line) && REPLY_HEADER[0]!.test(joined)) cut = i;
    else if (
      OUTLOOK_FIELD.test(line) &&
      lines.slice(i + 1, i + 4).some((l) => OUTLOOK_NEXT.test(l.trim()))
    )
      cut = i;
    else if (
      line.startsWith(">") &&
      lines.slice(i).every((l) => !l.trim() || l.trim().startsWith(">"))
    )
      cut = i;
  }
  if (cut === -1) return { body: text.trim(), quoted: false };
  const body = lines.slice(0, cut).join("\n").trim();
  if (!body) return { body: text.trim(), quoted: false };
  return { body, quoted: true };
}
