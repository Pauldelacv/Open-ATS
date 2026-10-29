/** Lower-case, accent-free version of a string, used for search and slugs. */
export function fold(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss");
}

export function slugify(input: string, maxLength = 60): string {
  const slug = fold(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "item";
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function shortId(length = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Text prepared for the `search_text` column: folded, single-spaced. */
export function searchable(...parts: Array<string | null | undefined>): string {
  return fold(parts.filter(Boolean).join(" "))
    .replace(/[^\p{L}\p{N}@.+\-_' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converts a user query into a prefix tsquery for the `simple` configuration.
 * Returns null when nothing searchable is left.
 */
export function toPrefixTsQuery(query: string): string | null {
  const terms = searchTerms(query);
  if (terms.length === 0) return null;
  return terms.map((t) => `${t.replace(/'/g, "''")}:*`).join(" & ");
}

export function searchTerms(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}@.+\-_]+/u)
    .flatMap((t) => t.split(/[@.+\-_]+/))
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

export type Snippet = { text: string; highlights: Array<[number, number]> };

/**
 * Finds the first occurrence of any term in `source` (accent and case insensitive) and returns
 * a window of text around it with the positions of every term inside that window.
 */
export function snippet(source: string, terms: string[], radius = 60): Snippet | null {
  if (!source || terms.length === 0) return null;
  const folded = foldPreservingLength(source);
  let first = -1;
  for (const term of terms) {
    const index = folded.indexOf(term);
    if (index !== -1 && (first === -1 || index < first)) first = index;
  }
  if (first === -1) return null;
  let start = Math.max(0, first - radius);
  let end = Math.min(source.length, first + radius * 2);
  if (start > 0) {
    const space = source.indexOf(" ", start);
    if (space !== -1 && space < first) start = space + 1;
  }
  if (end < source.length) {
    const space = source.lastIndexOf(" ", end);
    if (space > first) end = space;
  }
  const prefix = start > 0 ? "…" : "";
  const suffix = end < source.length ? "…" : "";
  const text = prefix + source.slice(start, end).replace(/\s+/g, " ") + suffix;
  return { text, highlights: highlightRanges(text, terms) };
}

export function highlightRanges(text: string, terms: string[]): Array<[number, number]> {
  const folded = foldPreservingLength(text);
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let from = 0;
    while (term && (from = folded.indexOf(term, from)) !== -1) {
      ranges.push([from, from + term.length]);
      from += term.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** Folds each character independently so indices still match the original string. */
function foldPreservingLength(input: string): string {
  let out = "";
  for (const ch of input) {
    const f = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    out += f.length === ch.length ? f : ch.length === 1 ? (f[0] ?? ch) : f.padEnd(ch.length, " ");
  }
  return out;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function fullName(c: { firstName: string; lastName: string }): string {
  return `${c.firstName} ${c.lastName}`.trim();
}
