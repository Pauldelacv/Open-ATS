import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  activities,
  applications,
  candidates,
  emailMessages,
  files,
  jobMembers,
  notifications,
} from "@/lib/db/schema";
import { signUpAllowed } from "@/lib/auth";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import {
  addNote,
  getApplicationDetail,
  listEvaluations,
  saveEvaluation,
} from "@/lib/services/candidates";
import { anonymizeCandidate, exportCandidate, runRetention } from "@/lib/services/gdpr";
import { createJob, getJob, listJobs, saveStages, setJobStatus } from "@/lib/services/jobs";
import { getBoard, moveApplications, restorePositions } from "@/lib/services/pipeline";
import { rejectApplications } from "@/lib/services/rejections";
import { searchPool } from "@/lib/services/search";
import { addTag } from "@/lib/services/tags";
import {
  acceptInvitation,
  changeRole,
  inviteMember,
  LastAdminError,
  listMembers,
  removeMember,
} from "@/lib/services/team";
import type { Ctx } from "@/lib/services/types";
import { encodeMentions } from "@/lib/mentions";
import { addMember, apply, createTenant, createUser, publishedJob } from "../helpers";

describe("applications from the career site", () => {
  let ctx: Ctx;
  let jobA: { id: string };
  let jobB: { id: string };
  beforeAll(async () => {
    ctx = await createTenant("Apply");
    jobA = await publishedJob(ctx, "Ébéniste");
    jobB = await publishedJob(ctx, "Designer");
  });

  it("creates the candidate in the first stage with consent, CV text and a logged confirmation", async () => {
    const result = await apply(ctx, jobA.id, {
      firstName: "Inès",
      lastName: "Moulin",
      email: "ines.moulin@example.test",
    });
    const board = await getBoard(ctx, jobA.id);
    const card = board.cards.find((c) => c.id === result.applicationId)!;
    expect(card.stageId).toBe(board.stages[0]!.id);
    expect(card.isNew).toBe(true);
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, result.applicationId));
    expect(app!.consentAt).toBeInstanceOf(Date);
    const [file] = await db.select().from(files).where(eq(files.candidateId, result.candidateId));
    expect(file!.textContent).toContain("Kubernetes");
    const mails = await db
      .select()
      .from(emailMessages)
      .where(eq(emailMessages.applicationId, result.applicationId));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.status).toBe("logged");
    expect(mails[0]!.subject).toContain("Ébéniste");
  });

  it("deduplicates candidates by email across jobs and on re-application", async () => {
    const first = await apply(ctx, jobA.id, {
      firstName: "Paul",
      lastName: "Durand",
      email: "paul@example.test",
    });
    const second = await apply(ctx, jobB.id, {
      firstName: "Paul",
      lastName: "Durand",
      email: "PAUL@example.test",
    });
    const again = await apply(ctx, jobA.id, {
      firstName: "Paul",
      lastName: "Durand",
      email: "paul@example.test",
      message: "Nouveau message",
    });
    expect(second.candidateId).toBe(first.candidateId);
    expect(again.candidateId).toBe(first.candidateId);
    expect(again.applicationId).toBe(first.applicationId);
    expect(again.reapplied).toBe(true);
    const rows = await db
      .select()
      .from(candidates)
      .where(
        and(eq(candidates.organizationId, ctx.orgId), eq(candidates.email, "paul@example.test")),
      );
    expect(rows).toHaveLength(1);
    const apps = await db
      .select()
      .from(applications)
      .where(eq(applications.candidateId, first.candidateId));
    expect(apps).toHaveLength(2);
  });
});

describe("pipeline", () => {
  let ctx: Ctx;
  let job: { id: string };
  let ids: string[];
  beforeAll(async () => {
    ctx = await createTenant("Pipeline");
    job = await publishedJob(ctx);
    ids = [];
    for (const n of [1, 2, 3]) {
      ids.push(
        (
          await apply(ctx, job.id, {
            firstName: `C${n}`,
            lastName: "Test",
            email: `c${n}@pipeline.test`,
          })
        ).applicationId,
      );
    }
  });

  it("moves cards to a position and can undo", async () => {
    const before = await getBoard(ctx, job.id);
    const interview = before.stages.find((s) => s.name === "Entretien")!;
    const previous = await moveApplications(ctx, [ids[0]!, ids[1]!], interview.id, 0);
    let board = await getBoard(ctx, job.id);
    const column = board.cards
      .filter((c) => c.stageId === interview.id)
      .sort((x, y) => x.position - y.position)
      .map((c) => c.id);
    expect(column).toEqual([ids[0], ids[1]]);
    // Insert the third card between the two.
    await moveApplications(ctx, [ids[2]!], interview.id, 1);
    board = await getBoard(ctx, job.id);
    expect(
      board.cards
        .filter((c) => c.stageId === interview.id)
        .sort((x, y) => x.position - y.position)
        .map((c) => c.id),
    ).toEqual([ids[0], ids[2], ids[1]]);
    await restorePositions(ctx, previous);
    board = await getBoard(ctx, job.id);
    expect(board.cards.find((c) => c.id === ids[0])!.stageId).toBe(before.stages[0]!.id);
    const history = await db.select().from(activities).where(eq(activities.applicationId, ids[0]!));
    expect(history.map((h) => h.type)).toContain("stage_changed");
  });

  it("rejects with a reason and an email, and moving back undoes the rejection", async () => {
    const result = await rejectApplications(ctx, [ids[1]!], {
      reason: "position_filled",
      email: { subject: "Votre candidature pour {{offre}}", body: "Bonjour {{prénom}}" },
    });
    expect(result.rejected).toBe(1);
    expect(result.emails.map((e) => e.status)).toEqual(["logged"]);
    const [app] = await db.select().from(applications).where(eq(applications.id, ids[1]!));
    expect(app!.rejectionReason).toBe("position_filled");
    const [mail] = await db
      .select()
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.applicationId, ids[1]!),
          eq(emailMessages.subject, "Votre candidature pour Développeur full-stack"),
        ),
      );
    expect(mail!.body).toBe("Bonjour C2");
    const board = await getBoard(ctx, job.id);
    const screening = board.stages.find((s) => s.name === "Présélection")!;
    await moveApplications(ctx, [ids[1]!], screening.id, 0);
    const [back] = await db.select().from(applications).where(eq(applications.id, ids[1]!));
    expect(back!.rejectedAt).toBeNull();
  });

  it("keeps fixed stages and reassigns cards of removed stages", async () => {
    const board = await getBoard(ctx, job.id);
    const offer = board.stages.find((s) => s.name === "Offre")!;
    await moveApplications(ctx, [ids[0]!], offer.id, 0);
    const kept = board.stages
      .filter((s) => s.id !== offer.id)
      .map((s) => ({ id: s.id, name: s.name }));
    const stages = await saveStages(ctx, job.id, [...kept, { name: "Test technique" }]);
    expect(stages.map((s) => s.name)).toEqual([
      "Nouveau",
      "Présélection",
      "Entretien",
      "Test technique",
      "Embauché",
      "Refusé",
    ]);
    const [moved] = await db.select().from(applications).where(eq(applications.id, ids[0]!));
    expect(moved!.stageId).toBe(stages[0]!.id);
    const withoutHired = stages
      .filter((s) => s.kind !== "hired")
      .map((s) => ({ id: s.id, name: s.name }));
    await expect(saveStages(ctx, job.id, withoutHired)).rejects.toThrow();
  });
});

describe("roles", () => {
  let admin: Ctx;
  let member: Ctx;
  let recruiter: Ctx;
  let assigned: { id: string };
  let other: { id: string };
  beforeAll(async () => {
    admin = await createTenant("Roles");
    member = await addMember(admin, "member", "Manager");
    recruiter = await addMember(admin, "recruiter", "Recruteur");
    assigned = await publishedJob(admin, "Poste assigné");
    other = await publishedJob(admin, "Autre poste");
    await db
      .insert(jobMembers)
      .values({ organizationId: admin.orgId, jobId: assigned.id, userId: member.userId });
    await apply(admin, assigned.id, {
      firstName: "Visible",
      lastName: "Candidat",
      email: "visible@roles.test",
    });
    await apply(admin, other.id, {
      firstName: "Invisible",
      lastName: "Candidat",
      email: "invisible@roles.test",
    });
  });

  it("members only see the jobs they are assigned to and their candidates", async () => {
    expect((await listJobs(member)).map((j) => j.title)).toEqual(["Poste assigné"]);
    await expect(getJob(member, other.id)).rejects.toBeInstanceOf(NotFoundError);
    const pool = await searchPool(member, {});
    expect(pool.rows.map((r) => r.firstName)).toEqual(["Visible"]);
    expect((await searchPool(recruiter, {})).total).toBe(2);
  });

  it("members can comment and evaluate but not move, reject or manage jobs", async () => {
    const board = await getBoard(member, assigned.id);
    const card = board.cards[0]!;
    await expect(
      moveApplications(member, [card.id], board.stages[1]!.id, 0),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rejectApplications(member, [card.id], { reason: "other" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createJob(member, { title: "Nope" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setJobStatus(member, assigned.id, "archived")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await addNote(member, {
      candidateId: card.candidateId,
      applicationId: card.id,
      body: "Bon profil",
    });
    await saveEvaluation(member, { applicationId: card.id, rating: 4, comment: "" });
  });

  it("keeps at least one admin", async () => {
    const members = await listMembers(admin);
    const self = members.find((m) => m.userId === admin.userId)!;
    await expect(changeRole(admin, self.membershipId, "recruiter")).rejects.toBeInstanceOf(
      LastAdminError,
    );
    await expect(removeMember(admin, self.membershipId)).rejects.toBeInstanceOf(LastAdminError);
    await expect(changeRole(recruiter, self.membershipId, "member")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("invitations allow sign-up only for the invited address and add the membership", async () => {
    expect(await signUpAllowed("nobody@example.test")).toBe(false);
    const { link } = await inviteMember(admin, {
      email: "New.Person@Example.test",
      role: "recruiter",
    });
    expect(await signUpAllowed("new.person@example.test")).toBe(true);
    const token = link.split("/invite/")[1]!;
    const userId = await createUser("New Person");
    await expect(
      acceptInvitation(token, { id: userId, email: "someone.else@example.test" }),
    ).rejects.toThrow();
    await acceptInvitation(token, { id: userId, email: "new.person@example.test" });
    expect(
      (await listMembers(admin)).some((m) => m.userId === userId && m.role === "recruiter"),
    ).toBe(true);
    expect(await signUpAllowed("new.person@example.test")).toBe(false);
  });
});

describe("evaluations are blind until you give yours", () => {
  it("hides others' ratings, then shows them with the average", async () => {
    const admin = await createTenant("Blind");
    const colleague = await addMember(admin, "recruiter", "Collègue");
    const job = await publishedJob(admin);
    const { applicationId } = await apply(admin, job.id, {
      firstName: "Blind",
      lastName: "Test",
      email: "blind@test.test",
    });
    await saveEvaluation(colleague, { applicationId, rating: 5, comment: "Excellent" });
    const hidden = await listEvaluations(admin, applicationId);
    expect(hidden).toMatchObject({ mine: null, others: [], hiddenCount: 1, average: null });
    const board = await getBoard(admin, job.id);
    expect(board.cards[0]!.averageRating).toBeNull();
    expect(board.cards[0]!.evaluationCount).toBe(1);
    await saveEvaluation(admin, { applicationId, rating: 3, comment: "" });
    const visible = await listEvaluations(admin, applicationId);
    expect(visible.others.map((e) => e.rating)).toEqual([5]);
    expect(visible.average).toBe(4);
  });
});

describe("notes and mentions", () => {
  it("notifies mentioned colleagues once, never the author", async () => {
    const admin = await createTenant("Mentions");
    const colleague = await addMember(admin, "recruiter", "Claire Dubois");
    const job = await publishedJob(admin);
    const { applicationId, candidateId } = await apply(admin, job.id, {
      firstName: "Mention",
      lastName: "Test",
      email: "mention@test.test",
    });
    const body = encodeMentions("@Claire Dubois et moi @Admin", [
      { id: colleague.userId, name: "Claire Dubois" },
      { id: admin.userId, name: "Admin" },
    ]);
    await addNote(admin, { candidateId, applicationId, body });
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.candidateId, candidateId));
    expect(rows.map((r) => r.userId)).toEqual([colleague.userId]);
    const journal = await db
      .select()
      .from(emailMessages)
      .where(
        and(eq(emailMessages.organizationId, admin.orgId), eq(emailMessages.category, "team")),
      );
    expect(journal.some((m) => m.body.includes("@Claire Dubois"))).toBe(true);
  });
});

describe("talent pool search", () => {
  it("finds candidates by name without accents, by CV text, by notes and by tags", async () => {
    const ctx = await createTenant("Search");
    const job = await publishedJob(ctx);
    const helene = await apply(
      ctx,
      job.id,
      { firstName: "Hélène", lastName: "Garçon", email: "helene@search.test" },
      "Spécialiste du vernis à l'huile",
    );
    const other = await apply(
      ctx,
      job.id,
      { firstName: "Tom", lastName: "Martin", email: "tom@search.test" },
      "Développeur Rust",
    );
    await addNote(ctx, { candidateId: other.candidateId, body: "Parle couramment le portugais" });
    await addTag(ctx, [helene.candidateId], "Vivier 2027");
    const names = async (q: string) => (await searchPool(ctx, { q })).rows.map((r) => r.firstName);
    expect(await names("helene garcon")).toEqual(["Hélène"]);
    expect(await names("vern")).toEqual(["Hélène"]);
    expect(await names("PORTUGAIS")).toEqual(["Tom"]);
    expect(await names("vivier")).toEqual(["Hélène"]);
    expect(await names("tom@search")).toEqual(["Tom"]);
    const hit = (await searchPool(ctx, { q: "vernis" })).rows[0]!;
    expect(hit.match?.field).toBe("cv");
    const [start, end] = hit.match!.snippet.highlights[0]!;
    expect(hit.match!.snippet.text.slice(start, end).toLowerCase()).toBe("vernis");
  });
});

describe("GDPR", () => {
  it("anonymises candidates past the retention period and keeps the others", async () => {
    const ctx = await createTenant("Retention");
    const job = await publishedJob(ctx);
    const old = await apply(ctx, job.id, {
      firstName: "Ancien",
      lastName: "Candidat",
      email: "old@gdpr.test",
    });
    const recent = await apply(ctx, job.id, {
      firstName: "Récent",
      lastName: "Candidat",
      email: "recent@gdpr.test",
    });
    await addNote(ctx, { candidateId: old.candidateId, body: "Note à effacer" });
    await db
      .update(candidates)
      .set({ lastActivityAt: new Date(Date.now() - 25 * 30 * 24 * 3600 * 1000) })
      .where(eq(candidates.id, old.candidateId));
    const count = await runRetention();
    expect(count).toBeGreaterThanOrEqual(1);
    const [anon] = await db.select().from(candidates).where(eq(candidates.id, old.candidateId));
    expect(anon).toMatchObject({
      email: null,
      phone: null,
      firstName: "Candidat",
      lastName: "anonymisé",
      searchText: "",
    });
    expect(anon!.anonymizedAt).toBeInstanceOf(Date);
    expect(
      await db.select().from(files).where(eq(files.candidateId, old.candidateId)),
    ).toHaveLength(0);
    const detail = await getApplicationDetail(ctx, old.applicationId);
    expect(detail.notes).toHaveLength(0);
    expect(detail.activity.map((a) => a.type)).toEqual(["anonymized"]);
    const [kept] = await db.select().from(candidates).where(eq(candidates.id, recent.candidateId));
    expect(kept!.email).toBe("recent@gdpr.test");
  });

  it("exports everything as a ZIP and deletes permanently", async () => {
    const { unzipSync, strFromU8 } = await import("fflate");
    const ctx = await createTenant("Export");
    const job = await publishedJob(ctx);
    const { candidateId } = await apply(ctx, job.id, {
      firstName: "Export",
      lastName: "Moi",
      email: "export@gdpr.test",
    });
    const { zip, fileName } = await exportCandidate(ctx, candidateId);
    expect(fileName).toBe("export-moi-export.zip");
    const entries = unzipSync(zip);
    const data = JSON.parse(strFromU8(entries["candidate.json"]!));
    expect(data.candidate.email).toBe("export@gdpr.test");
    expect(Object.keys(entries).some((k) => k.startsWith("files/") && k.endsWith(".pdf"))).toBe(
      true,
    );
    const { deleteCandidate } = await import("@/lib/services/gdpr");
    await deleteCandidate(ctx, candidateId);
    expect(await db.select().from(candidates).where(eq(candidates.id, candidateId))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(applications).where(eq(applications.candidateId, candidateId)),
    ).toHaveLength(0);
  });

  it("can anonymise directly, idempotently", async () => {
    const ctx = await createTenant("Anon");
    const job = await publishedJob(ctx);
    const { candidateId } = await apply(ctx, job.id, {
      firstName: "Deux",
      lastName: "Fois",
      email: "twice@gdpr.test",
    });
    await anonymizeCandidate(ctx.orgId, candidateId);
    await anonymizeCandidate(ctx.orgId, candidateId);
    const [row] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
    expect(row!.email).toBeNull();
  });
});

describe("demo organisation", () => {
  it("can be deleted with its demo accounts, and only if it is the demo", async () => {
    const { deleteDemoOrganization, NotDemoError } = await import("@/lib/services/organizations");
    const { organizations, memberships, user } = await import("@/lib/db/schema");
    const real = await createTenant("Real");
    await expect(deleteDemoOrganization(real)).rejects.toBeInstanceOf(NotDemoError);
    const demoUser = `demo_admin_${Date.now()}`;
    await db
      .insert(user)
      .values({ id: demoUser, name: "Demo", email: `${demoUser}@open-ats.example` });
    const [org] = await db
      .insert(organizations)
      .values({ name: "Démo", slug: `demo-${Date.now()}`, isDemo: true })
      .returning();
    await db
      .insert(memberships)
      .values({ organizationId: org!.id, userId: demoUser, role: "admin" });
    const job = await publishedJob({ orgId: org!.id, userId: demoUser, role: "admin" });
    await apply({ orgId: org!.id, userId: demoUser, role: "admin" }, job.id, {
      firstName: "Fictif",
      lastName: "Candidat",
      email: "fictif@demo.test",
    });
    await deleteDemoOrganization({ orgId: org!.id, userId: demoUser, role: "admin" });
    expect(await db.select().from(organizations).where(eq(organizations.id, org!.id))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(candidates).where(eq(candidates.organizationId, org!.id)),
    ).toHaveLength(0);
    expect(await db.select().from(user).where(eq(user.id, demoUser))).toHaveLength(0);
  });
});
