import type { CvKind } from "@/lib/validation/application";

const MAX_TEXT = 200_000;

/** Plain text of a CV, used for full-text search. Never throws: an unreadable file gives "". */
export async function extractCvText(kind: CvKind, data: Buffer): Promise<string> {
  try {
    const text = await Promise.race([
      kind === "pdf" ? pdfText(data) : docxText(data),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), 15_000)),
    ]);
    return text
      .replace(/\u0000/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_TEXT);
  } catch (error) {
    console.warn("[cv] text extraction failed", error instanceof Error ? error.message : error);
    return "";
  }
}

async function pdfText(data: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function docxText(data: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: data });
  return result.value;
}

/** Sanitised HTML of a DOCX CV for the preview. */
export async function docxToHtml(data: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const { default: sanitizeHtml } = await import("sanitize-html");
  const result = await mammoth.convertToHtml({ buffer: data });
  return sanitizeHtml(result.value, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "a",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      }),
    },
  });
}
