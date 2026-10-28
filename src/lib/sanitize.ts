import sanitizeHtml from "sanitize-html";

/** Rich text allowed in job descriptions and the company presentation. */
export function sanitizeRichText(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "a",
      "blockquote",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "nofollow noopener noreferrer",
        target: "_blank",
      }),
      b: "strong",
      i: "em",
      h1: "h2",
      h4: "h3",
    },
  });
  // An editor left empty produces "<p></p>".
  return /^(\s|<p>\s*<\/p>|<br\s*\/?>)*$/.test(clean) ? "" : clean;
}

/** Plain text version of rich text, for meta descriptions and structured data. */
export function richTextToPlain(html: string): string {
  return sanitizeHtml(
    html.replace(/<\/(p|h2|h3|li|blockquote)>/g, "$&\n").replace(/<br\s*\/?>/g, "\n"),
    {
      allowedTags: [],
      allowedAttributes: {},
    },
  )
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
