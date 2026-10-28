/** Mentions are stored in note bodies as <@userId> tokens. */
const TOKEN = /<@([A-Za-z0-9_-]{1,64})>/g;

export function mentionedIds(body: string): string[] {
  return [...new Set([...body.matchAll(TOKEN)].map((m) => m[1]!))];
}

export type NoteSegment = { type: "text"; text: string } | { type: "mention"; userId: string };

export function noteSegments(body: string): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    if (match.index! > last) segments.push({ type: "text", text: body.slice(last, match.index) });
    segments.push({ type: "mention", userId: match[1]! });
    last = match.index! + match[0].length;
  }
  if (last < body.length) segments.push({ type: "text", text: body.slice(last) });
  return segments;
}

/** Replaces « @Name » typed in the composer by tokens, for the members that were picked. */
export function encodeMentions(text: string, picked: Array<{ id: string; name: string }>): string {
  let out = text;
  for (const member of [...picked].sort((a, b) => b.name.length - a.name.length)) {
    out = out.split(`@${member.name}`).join(`<@${member.id}>`);
  }
  return out;
}

/** Plain text with names, for emails and search. */
export function plainNote(body: string, names: Map<string, string>): string {
  return body.replace(TOKEN, (_, id: string) => `@${names.get(id) ?? "?"}`);
}
