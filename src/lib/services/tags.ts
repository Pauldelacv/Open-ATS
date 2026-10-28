import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidates, candidateTags, tags } from "@/lib/db/schema";
import { assertCan } from "@/lib/permissions";
import { logActivity } from "./activity";
import { refreshSearchText } from "./search-index";
import type { Ctx } from "./types";

export async function listTags(ctx: Ctx) {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      count: sql<number>`(select count(*)::int from ${candidateTags} ct where ct.tag_id = "tags"."id")`,
    })
    .from(tags)
    .where(eq(tags.organizationId, ctx.orgId))
    .orderBy(asc(tags.name));
}

async function ensureTag(ctx: Ctx, name: string) {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) return null;
  const [existing] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.organizationId, ctx.orgId), sql`lower(${tags.name}) = lower(${clean})`));
  if (existing) return existing;
  const [created] = await db
    .insert(tags)
    .values({ organizationId: ctx.orgId, name: clean })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [raced] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.organizationId, ctx.orgId), sql`lower(${tags.name}) = lower(${clean})`));
  return raced ?? null;
}

/** Only candidates of the organisation are kept. */
async function ownCandidates(ctx: Ctx, candidateIds: string[]) {
  if (candidateIds.length === 0) return [];
  const rows = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.organizationId, ctx.orgId), inArray(candidates.id, candidateIds)));
  return rows.map((r) => r.id);
}

export async function addTag(ctx: Ctx, candidateIds: string[], name: string) {
  assertCan(ctx.role, "candidate:tag");
  const tag = await ensureTag(ctx, name);
  if (!tag) return null;
  const ids = await ownCandidates(ctx, candidateIds);
  for (const candidateId of ids) {
    const inserted = await db
      .insert(candidateTags)
      .values({ organizationId: ctx.orgId, candidateId, tagId: tag.id })
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) {
      await logActivity(db, ctx, { candidateId, type: "tag_added", data: { tag: tag.name } });
      await refreshSearchText(db, candidateId);
    }
  }
  return tag;
}

export async function removeTag(ctx: Ctx, candidateId: string, tagId: string) {
  assertCan(ctx.role, "candidate:tag");
  const [tag] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.organizationId, ctx.orgId)));
  if (!tag) return;
  const removed = await db
    .delete(candidateTags)
    .where(
      and(
        eq(candidateTags.candidateId, candidateId),
        eq(candidateTags.tagId, tagId),
        eq(candidateTags.organizationId, ctx.orgId),
      ),
    )
    .returning();
  if (removed.length > 0) {
    await logActivity(db, ctx, { candidateId, type: "tag_removed", data: { tag: tag.name } });
    await refreshSearchText(db, candidateId);
  }
}

export async function candidateTagList(ctx: Ctx, candidateId: string) {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(candidateTags)
    .innerJoin(tags, eq(tags.id, candidateTags.tagId))
    .where(
      and(eq(candidateTags.candidateId, candidateId), eq(candidateTags.organizationId, ctx.orgId)),
    )
    .orderBy(asc(tags.name));
}
