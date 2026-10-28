import { eq } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { candidates, candidateTags, files, notes, tags } from "@/lib/db/schema";
import { searchable } from "@/lib/utils/text";

/** Rebuilds the folded text behind a candidate's full-text index. */
export async function refreshSearchText(tx: Tx | typeof db, candidateId: string) {
  const [candidate] = await tx
    .select({
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      phone: candidates.phone,
      linkUrl: candidates.linkUrl,
    })
    .from(candidates)
    .where(eq(candidates.id, candidateId));
  if (!candidate) return;
  const [noteRows, fileRows, tagRows] = await Promise.all([
    tx.select({ body: notes.body }).from(notes).where(eq(notes.candidateId, candidateId)),
    tx.select({ text: files.textContent }).from(files).where(eq(files.candidateId, candidateId)),
    tx
      .select({ name: tags.name })
      .from(candidateTags)
      .innerJoin(tags, eq(tags.id, candidateTags.tagId))
      .where(eq(candidateTags.candidateId, candidateId)),
  ]);
  const text = searchable(
    candidate.firstName,
    candidate.lastName,
    candidate.email,
    candidate.phone,
    candidate.linkUrl,
    ...tagRows.map((t) => t.name),
    ...noteRows.map((n) => n.body),
    ...fileRows.map((f) => f.text),
  );
  await tx.update(candidates).set({ searchText: text }).where(eq(candidates.id, candidateId));
}
