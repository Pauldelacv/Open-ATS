import { and, asc, desc, eq, exists, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, candidates, candidateTags, files, jobs, notes, pipelineStages, tags } from "@/lib/db/schema";
import { searchTerms, snippet, toPrefixTsQuery, type Snippet } from "@/lib/utils/text";
import { candidateAccess, jobAccess } from "./access";
import type { Ctx } from "./types";

export type PoolStatus = "active" | "hired" | "rejected";

export type PoolFilters = { q?: string; tagId?: string; jobId?: string; status?: PoolStatus; page?: number };

export type PoolRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  lastActivityAt: Date;
  latest: { applicationId: string; jobId: string; jobTitle: string; stageName: string; stageKind: string } | null;
  applicationCount: number;
  tags: string[];
  match: { field: "cv" | "note"; snippet: Snippet } | null;
  nameHighlights: Array<[number, number]>;
};

const PAGE_SIZE = 50;

function statusCondition(status: PoolStatus): SQL {
  const kinds = status === "active" ? ["new", "active"] : [status];
  return exists(
    db
      .select({ one: sql`1` })
      .from(applications)
      .innerJoin(pipelineStages, eq(pipelineStages.id, applications.stageId))
      .where(and(eq(applications.candidateId, candidates.id), inArray(pipelineStages.kind, kinds as Array<"new" | "active" | "hired" | "rejected">))),
  );
}

export async function searchPool(ctx: Ctx, filters: PoolFilters) {
  const query = filters.q?.trim() ?? "";
  const tsQuery = query ? toPrefixTsQuery(query) : null;
  const conditions: Array<SQL | undefined> = [
    eq(candidates.organizationId, ctx.orgId),
    isNull(candidates.anonymizedAt),
    candidateAccess(ctx, candidates.id),
  ];
  if (tsQuery) conditions.push(sql`${candidates.searchVector} @@ to_tsquery('simple', ${tsQuery})`);
  if (filters.tagId) {
    conditions.push(
      exists(db.select({ one: sql`1` }).from(candidateTags).where(and(eq(candidateTags.candidateId, candidates.id), eq(candidateTags.tagId, filters.tagId)))),
    );
  }
  if (filters.jobId) {
    conditions.push(
      exists(db.select({ one: sql`1` }).from(applications).where(and(eq(applications.candidateId, candidates.id), eq(applications.jobId, filters.jobId)))),
    );
  }
  if (filters.status) conditions.push(statusCondition(filters.status));
  const where = and(...conditions);
  const page = Math.max(1, filters.page ?? 1);

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        lastActivityAt: candidates.lastActivityAt,
      })
      .from(candidates)
      .where(where)
      .orderBy(
        ...(tsQuery ? [desc(sql`ts_rank(${candidates.searchVector}, to_tsquery('simple', ${tsQuery}))`)] : []),
        desc(candidates.lastActivityAt),
      )
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(candidates).where(where),
  ]);

  const ids = rows.map((r) => r.id);
  const [apps, tagRows, noteRows, fileRows] = ids.length
    ? await Promise.all([
        db
          .select({
            candidateId: applications.candidateId,
            applicationId: applications.id,
            jobId: jobs.id,
            jobTitle: jobs.title,
            stageName: pipelineStages.name,
            stageKind: pipelineStages.kind,
            createdAt: applications.createdAt,
          })
          .from(applications)
          .innerJoin(jobs, eq(jobs.id, applications.jobId))
          .innerJoin(pipelineStages, eq(pipelineStages.id, applications.stageId))
          .where(and(inArray(applications.candidateId, ids), jobAccess(ctx)))
          .orderBy(desc(applications.createdAt)),
        db
          .select({ candidateId: candidateTags.candidateId, name: tags.name })
          .from(candidateTags)
          .innerJoin(tags, eq(tags.id, candidateTags.tagId))
          .where(inArray(candidateTags.candidateId, ids))
          .orderBy(asc(tags.name)),
        query ? db.select({ candidateId: notes.candidateId, body: notes.body }).from(notes).where(inArray(notes.candidateId, ids)) : Promise.resolve([]),
        query
          ? db.select({ candidateId: files.candidateId, text: files.textContent }).from(files).where(inArray(files.candidateId, ids))
          : Promise.resolve([]),
      ])
    : [[], [], [], []];

  const terms = query ? searchTerms(query) : [];
  const results: PoolRow[] = rows.map((row) => {
    const candidateApps = apps.filter((a) => a.candidateId === row.id);
    const latest = candidateApps[0];
    const name = `${row.firstName} ${row.lastName}`;
    const nameSnippet = terms.length ? snippet(name, terms, 200) : null;
    let match: PoolRow["match"] = null;
    const inIdentity = nameSnippet || (row.email && terms.some((term) => row.email!.includes(term)));
    if (terms.length && !inIdentity) {
      for (const n of noteRows.filter((x) => x.candidateId === row.id)) {
        const s = snippet(n.body.replace(/<@[^>]+>/g, "@"), terms);
        if (s) {
          match = { field: "note", snippet: s };
          break;
        }
      }
      if (!match) {
        for (const f of fileRows.filter((x) => x.candidateId === row.id)) {
          const s = snippet(f.text, terms);
          if (s) {
            match = { field: "cv", snippet: s };
            break;
          }
        }
      }
    }
    return {
      ...row,
      latest: latest
        ? { applicationId: latest.applicationId, jobId: latest.jobId, jobTitle: latest.jobTitle, stageName: latest.stageName, stageKind: latest.stageKind }
        : null,
      applicationCount: candidateApps.length,
      tags: tagRows.filter((t) => t.candidateId === row.id).map((t) => t.name),
      match,
      nameHighlights: nameSnippet && !nameSnippet.text.startsWith("…") ? nameSnippet.highlights : [],
    };
  });

  return { rows: results, total: countRow?.total ?? 0, page, pageSize: PAGE_SIZE };
}

/** Command palette: a few candidates and jobs. */
export async function quickSearch(ctx: Ctx, query: string) {
  const q = query.trim().slice(0, 100);
  const tsQuery = toPrefixTsQuery(q);
  const [candidateRows, jobRows] = await Promise.all([
    tsQuery
      ? db
          .select({ id: candidates.id, firstName: candidates.firstName, lastName: candidates.lastName, email: candidates.email })
          .from(candidates)
          .where(
            and(
              eq(candidates.organizationId, ctx.orgId),
              isNull(candidates.anonymizedAt),
              candidateAccess(ctx, candidates.id),
              sql`${candidates.searchVector} @@ to_tsquery('simple', ${tsQuery})`,
            ),
          )
          .orderBy(desc(sql`ts_rank(${candidates.searchVector}, to_tsquery('simple', ${tsQuery}))`), desc(candidates.lastActivityAt))
          .limit(6)
      : Promise.resolve([]),
    db
      .select({ id: jobs.id, title: jobs.title, status: jobs.status })
      .from(jobs)
      .where(and(jobAccess(ctx), or(ilike(jobs.title, `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`), ilike(jobs.department, `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`))))
      .orderBy(desc(jobs.updatedAt))
      .limit(5),
  ]);
  const ids = candidateRows.map((c) => c.id);
  const latest = ids.length
    ? await db
        .select({ candidateId: applications.candidateId, applicationId: applications.id, jobId: jobs.id, jobTitle: jobs.title, createdAt: applications.createdAt })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(and(inArray(applications.candidateId, ids), jobAccess(ctx)))
        .orderBy(desc(applications.createdAt))
    : [];
  return {
    jobs: jobRows,
    candidates: candidateRows.map((c) => {
      const app = latest.find((a) => a.candidateId === c.id);
      return {
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        applicationId: app?.applicationId ?? null,
        jobId: app?.jobId ?? null,
        jobTitle: app?.jobTitle ?? null,
      };
    }),
  };
}
