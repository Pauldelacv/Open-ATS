import { getTableColumns, getTableName } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applications, files, invitations, memberships, notes, tenantTables } from "@/lib/db/schema";
import { NotFoundError } from "@/lib/permissions";
import { getApplicationDetail, addNote, saveEvaluation, listEvaluations, assertCandidateAccess } from "@/lib/services/candidates";
import { listTemplates, saveTemplate, sendCandidateEmails, listEmailJournal } from "@/lib/services/emails";
import { getAccessibleFile } from "@/lib/services/files";
import { exportCandidate, deleteCandidate, retentionOverview } from "@/lib/services/gdpr";
import { getJob, listJobs, setJobStatus, updateJob, saveStages, listStages, deleteDraftJob } from "@/lib/services/jobs";
import { addCandidateToJob } from "@/lib/services/manual-candidate";
import { unreadMentionCount } from "@/lib/services/notifications";
import { getBoard, moveApplications, markViewed } from "@/lib/services/pipeline";
import { rejectApplications } from "@/lib/services/rejections";
import { quickSearch, searchPool } from "@/lib/services/search";
import { addTag, removeTag, listTags } from "@/lib/services/tags";
import { changeRole, listMembers, removeMember, revokeInvitation, inviteMember } from "@/lib/services/team";
import type { Ctx } from "@/lib/services/types";
import { eq, sql } from "drizzle-orm";
import { apply, createTenant, publishedJob } from "../helpers";

/**
 * Two organisations with the same kind of data. Every service called with the context of
 * organisation A and identifiers of organisation B must neither read nor change B's data.
 */
describe("tenant isolation", () => {
  let a: Ctx;
  let b: Ctx;
  let bJob: { id: string };
  let bApplicationId: string;
  let bCandidateId: string;
  let bStageId: string;
  let bTemplateId: string;
  let bFileId: string;
  let bNoteId: string;
  let bMembershipId: string;
  let bInvitationId: string;

  beforeAll(async () => {
    a = await createTenant("Alpha");
    b = await createTenant("Beta");
    await publishedJob(a, "Poste chez Alpha");
    bJob = await publishedJob(b, "Poste secret chez Beta");
    const applied = await apply(b, bJob.id, { firstName: "Bérénice", lastName: "Secret", email: "berenice@beta.test" }, "Compétence confidentielle zephyr");
    bApplicationId = applied.applicationId;
    bCandidateId = applied.candidateId;
    const board = await getBoard(b, bJob.id);
    bStageId = board.stages[2]!.id;
    bTemplateId = (await listTemplates(b))[0]!.id;
    bFileId = (await db.select({ id: files.id }).from(files).where(eq(files.candidateId, bCandidateId)))[0]!.id;
    await addNote(b, { candidateId: bCandidateId, applicationId: bApplicationId, body: "Note privée zephyr" });
    bNoteId = (await db.select({ id: notes.id }).from(notes).where(eq(notes.candidateId, bCandidateId)))[0]!.id;
    await saveEvaluation(b, { applicationId: bApplicationId, rating: 5, comment: "Top" });
    await addTag(b, [bCandidateId], "Beta-only");
    bMembershipId = (await db.select({ id: memberships.id }).from(memberships).where(eq(memberships.organizationId, b.orgId)))[0]!.id;
    await inviteMember(b, { email: "invitee@beta.test", role: "recruiter" });
    bInvitationId = (await db.select({ id: invitations.id }).from(invitations).where(eq(invitations.organizationId, b.orgId)))[0]!.id;
  });

  it("every tenant table carries a non-null organization_id in the database", async () => {
    for (const table of Object.values(tenantTables)) {
      const name = getTableName(table);
      expect(Object.keys(getTableColumns(table)), name).toContain("organizationId");
      const rows = await db.execute<{ is_nullable: string }>(
        sql`select is_nullable from information_schema.columns where table_name = ${name} and column_name = 'organization_id'`,
      );
      expect(rows.length, name).toBe(1);
      expect(rows[0]!.is_nullable, name).toBe("NO");
    }
  });

  it("no other table holds candidate or job data without being listed as a tenant table", async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'organization_id'`,
    );
    const listed = new Set<string>(Object.values(tenantTables).map((t) => getTableName(t)));
    for (const row of rows) expect(listed.has(row.table_name), row.table_name).toBe(true);
  });

  it("lists only the organisation's own data", async () => {
    expect((await listJobs(a)).map((j) => j.title)).toEqual(["Poste chez Alpha"]);
    expect((await searchPool(a, {})).total).toBe(0);
    expect((await searchPool(a, { q: "zephyr" })).total).toBe(0);
    expect((await quickSearch(a, "Bérénice")).candidates).toEqual([]);
    expect((await quickSearch(a, "secret")).jobs).toEqual([]);
    expect((await listTags(a)).map((t) => t.name)).not.toContain("Beta-only");
    expect((await listMembers(a)).every((m) => m.userId === a.userId)).toBe(true);
    expect((await listTemplates(a)).map((t) => t.id)).not.toContain(bTemplateId);
    expect((await listEmailJournal(a)).some((e) => e.toEmail.endsWith("@beta.test"))).toBe(false);
    expect(await unreadMentionCount(a)).toBe(0);
    expect((await retentionOverview(a)).due).toBe(0);
  });

  it("refuses to read another organisation's records", async () => {
    await expect(getJob(a, bJob.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(listStages(a, bJob.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getBoard(a, bJob.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getApplicationDetail(a, bApplicationId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertCandidateAccess(a, bCandidateId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getAccessibleFile(a, bFileId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(exportCandidate(a, bCandidateId)).rejects.toBeInstanceOf(NotFoundError);
    const evaluations = await listEvaluations(a, bApplicationId);
    expect(evaluations.hiddenCount).toBe(0);
    expect(evaluations.others).toEqual([]);
  });

  it("refuses to change another organisation's records", async () => {
    await expect(updateJob(a, bJob.id, { title: "Piraté" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(setJobStatus(a, bJob.id, "archived")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteDraftJob(a, bJob.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveStages(a, bJob.id, [{ name: "Piraté" }])).rejects.toBeInstanceOf(NotFoundError);
    await expect(moveApplications(a, [bApplicationId], bStageId, 0)).rejects.toBeInstanceOf(NotFoundError);
    await expect(rejectApplications(a, [bApplicationId], { reason: "other" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(addNote(a, { candidateId: bCandidateId, body: "Intrusion" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveEvaluation(a, { applicationId: bApplicationId, rating: 1, comment: "" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(saveTemplate(a, bTemplateId, { name: "x", kind: "other", subject: "x", body: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(changeRole(a, bMembershipId, "member")).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeMember(a, bMembershipId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteCandidate(a, bCandidateId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addCandidateToJob(a, bJob.id, { firstName: "X", lastName: "Y", email: null, phone: null, linkUrl: null }, null)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    // Silent no-ops: nothing happens to B.
    await markViewed(a, bApplicationId);
    const [viewed] = await db.select({ viewedAt: applications.viewedAt }).from(applications).where(eq(applications.id, bApplicationId));
    expect(viewed!.viewedAt).toBeNull();
    await revokeInvitation(a, bInvitationId);
    expect(await addTag(a, [bCandidateId], "Intrusion")).not.toBeNull();
    const tagB = (await listTags(b)).find((t) => t.name === "Beta-only")!;
    await removeTag(a, bCandidateId, tagB.id);
    expect(await sendCandidateEmails(a, { applicationIds: [bApplicationId], subject: "x", body: "x" })).toEqual([]);

    // B is intact.
    const job = await getJob(b, bJob.id);
    expect(job.title).toBe("Poste secret chez Beta");
    expect(job.status).toBe("published");
    const detail = await getApplicationDetail(b, bApplicationId);
    expect(detail.tags.map((t) => t.name)).toEqual(["Beta-only"]);
    expect(detail.notes.map((n) => n.id)).toEqual([bNoteId]);
    expect((await db.select().from(invitations).where(eq(invitations.id, bInvitationId))).length).toBe(1);
    expect((await searchPool(b, { q: "zephyr" })).total).toBe(1);
  });
});
