import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/lib/db";
import {
  account,
  activities,
  applications,
  candidates,
  candidateTags,
  emailMessages,
  distributionChannels,
  emailTemplates,
  evaluations,
  jobMembers,
  jobQuestions,
  jobs,
  memberships,
  notes,
  notifications,
  organizations,
  pipelineStages,
  tags,
  user,
  type ApplicationAnswer,
} from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { defaultChannelRows } from "@/lib/services/default-channels";
import { defaultEmailTemplates } from "@/lib/services/organizations";
import { defaultStages } from "@/lib/services/jobs";
import { storeCv } from "@/lib/services/public-application";
import { refreshSearchText } from "@/lib/services/search-index";
import { renderTemplate } from "@/lib/services/template-render";
import { shortId, slugify } from "@/lib/utils/text";
import { renderCvPdf } from "./cv";
import { DEMO_ORG_SLUG, DEMO_PASSWORD } from "./constants";
import { demoCompany, demoJobs, demoPeople, demoProfiles, demoTags, demoUsers } from "./data";

const DAY = 24 * 3600 * 1000;

/** Small deterministic generator so that the demo looks the same on every install. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type StageKey = "new" | "screening" | "interview" | "offer" | "hired" | "rejected";

/** Who applies where, and how far they got. Indexes refer to demoPeople. */
const plan: Array<{
  person: number;
  job: string;
  stage: StageKey;
  daysAgo: number;
  viewed?: boolean;
}> = [
  // Développeur full-stack — 12
  { person: 0, job: "dev", stage: "interview", daysAgo: 16, viewed: true },
  { person: 1, job: "dev", stage: "offer", daysAgo: 17, viewed: true },
  { person: 2, job: "dev", stage: "screening", daysAgo: 12, viewed: true },
  { person: 3, job: "dev", stage: "new", daysAgo: 1 },
  { person: 5, job: "dev", stage: "new", daysAgo: 2 },
  { person: 9, job: "dev", stage: "screening", daysAgo: 10, viewed: true },
  { person: 11, job: "dev", stage: "rejected", daysAgo: 15, viewed: true },
  { person: 16, job: "dev", stage: "interview", daysAgo: 14, viewed: true },
  { person: 20, job: "dev", stage: "new", daysAgo: 0 },
  { person: 26, job: "dev", stage: "screening", daysAgo: 7, viewed: true },
  { person: 30, job: "dev", stage: "rejected", daysAgo: 13, viewed: true },
  { person: 38, job: "dev", stage: "new", daysAgo: 3, viewed: true },
  // Ébéniste — 9
  { person: 7, job: "ebeniste", stage: "hired", daysAgo: 38, viewed: true },
  { person: 13, job: "ebeniste", stage: "interview", daysAgo: 25, viewed: true },
  { person: 18, job: "ebeniste", stage: "interview", daysAgo: 21, viewed: true },
  { person: 22, job: "ebeniste", stage: "screening", daysAgo: 12, viewed: true },
  { person: 24, job: "ebeniste", stage: "screening", daysAgo: 9, viewed: true },
  { person: 32, job: "ebeniste", stage: "rejected", daysAgo: 30, viewed: true },
  { person: 34, job: "ebeniste", stage: "new", daysAgo: 2 },
  { person: 36, job: "ebeniste", stage: "rejected", daysAgo: 28, viewed: true },
  { person: 26, job: "ebeniste", stage: "new", daysAgo: 4 },
  // Chargé de clientèle — 7
  { person: 4, job: "sales", stage: "interview", daysAgo: 20, viewed: true },
  { person: 10, job: "sales", stage: "screening", daysAgo: 15, viewed: true },
  { person: 15, job: "sales", stage: "new", daysAgo: 1 },
  { person: 17, job: "sales", stage: "new", daysAgo: 3 },
  { person: 23, job: "sales", stage: "rejected", daysAgo: 22, viewed: true },
  { person: 29, job: "sales", stage: "new", daysAgo: 5, viewed: true },
  { person: 33, job: "sales", stage: "rejected", daysAgo: 19, viewed: true },
  // Alternance marketing — 5
  { person: 6, job: "marketing", stage: "screening", daysAgo: 7, viewed: true },
  { person: 14, job: "marketing", stage: "new", daysAgo: 1 },
  { person: 17, job: "marketing", stage: "new", daysAgo: 2 },
  { person: 25, job: "marketing", stage: "screening", daysAgo: 6, viewed: true },
  { person: 35, job: "marketing", stage: "rejected", daysAgo: 8, viewed: true },
  // Stage design produit — 6
  { person: 8, job: "design", stage: "interview", daysAgo: 24, viewed: true },
  { person: 12, job: "design", stage: "screening", daysAgo: 18, viewed: true },
  { person: 19, job: "design", stage: "screening", daysAgo: 11, viewed: true },
  { person: 21, job: "design", stage: "new", daysAgo: 2 },
  { person: 27, job: "design", stage: "new", daysAgo: 4 },
  { person: 31, job: "design", stage: "rejected", daysAgo: 20, viewed: true },
  // Responsable logistique, archived — an old application close to the end of retention.
  { person: 39, job: "logistics", stage: "rejected", daysAgo: 705, viewed: true },
  // Hors liste : people not yet planned get an application too.
  { person: 28, job: "sales", stage: "screening", daysAgo: 11, viewed: true },
  { person: 37, job: "design", stage: "new", daysAgo: 6, viewed: true },
];

const rejectionReasonsByStage = [
  "profile_mismatch",
  "experience",
  "position_filled",
  "salary",
] as const;

const noteTexts: Array<{
  author: "recruiter" | "member";
  text: string;
  mention?: "admin" | "recruiter" | "member";
}> = [
  {
    author: "recruiter",
    text: "Premier appel très positif. Disponible sous un mois, prétentions dans la fourchette.",
    mention: "admin",
  },
  {
    author: "member",
    text: "Bon niveau technique sur l'exercice. À creuser : expérience de la mise en production.",
  },
  { author: "recruiter", text: "Relancé par email, pas de réponse pour l'instant." },
  {
    author: "member",
    text: "Portfolio très soigné, beau travail sur les assemblages. Je propose un essai à l'atelier.",
    mention: "recruiter",
  },
  {
    author: "recruiter",
    text: "A déjà travaillé avec deux de nos clients hôteliers. Peut-on lui proposer un entretien cette semaine ?",
    mention: "admin",
  },
  {
    author: "member",
    text: "Profil plus junior que ce que nous cherchons, mais très bonne attitude. À garder pour un prochain poste.",
  },
  {
    author: "recruiter",
    text: "Références appelées : retours excellents sur la rigueur et la ponctualité.",
  },
];

async function upsertDemoUsers() {
  const hash = await hashPassword(DEMO_PASSWORD);
  const ids: Record<string, string> = {};
  for (const u of demoUsers) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, u.email));
    if (existing) {
      ids[u.key] = existing.id;
      continue;
    }
    const id = `demo_${u.key}_${shortId(10)}`;
    await db
      .insert(user)
      .values({ id, name: u.name, email: u.email, emailVerified: true, locale: "fr" });
    await db.insert(account).values({
      id: `acc_${shortId(16)}`,
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
    });
    ids[u.key] = id;
  }
  return ids;
}

function logoSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color}"/><path d="M20 46V18h12.5c6 0 9.5 3.4 9.5 8.6S38.5 35 32.5 35H26v11z" fill="#fff"/><path d="M26 23v7h6.2c2.4 0 3.8-1.3 3.8-3.5S34.6 23 32.2 23z" fill="${color}"/></svg>`;
}

export async function seedDemo(): Promise<{ created: boolean }> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, DEMO_ORG_SLUG));
  if (existing) return { created: false };

  const random = prng(20261028);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const now = Date.now();
  const users = await upsertDemoUsers();

  const [org] = await db
    .insert(organizations)
    .values({
      name: demoCompany.name,
      slug: demoCompany.slug,
      locale: "fr",
      brandColor: demoCompany.brandColor,
      tagline: demoCompany.tagline,
      descriptionHtml: demoCompany.descriptionHtml,
      websiteUrl: demoCompany.websiteUrl,
      privacyContactEmail: demoCompany.privacyContactEmail,
      isDemo: true,
    })
    .returning();
  const orgId = org!.id;
  const logoKey = `org/${orgId}/public/logo-${shortId(10)}.svg`;
  await storage().put(logoKey, Buffer.from(logoSvg(demoCompany.brandColor)), "image/svg+xml");
  await db.update(organizations).set({ logoKey }).where(eq(organizations.id, orgId));

  for (const u of demoUsers) {
    await db
      .insert(memberships)
      .values({ organizationId: orgId, userId: users[u.key]!, role: u.role })
      .onConflictDoNothing();
  }
  const templates = await db
    .insert(emailTemplates)
    .values(defaultEmailTemplates(orgId, "fr"))
    .returning();
  const confirmation = templates.find((t) => t.kind === "confirmation")!;
  const rejection = templates.find((t) => t.kind === "rejection")!;
  const interview = templates.find((t) => t.kind === "interview")!;

  const channelRows = await db
    .insert(distributionChannels)
    .values(defaultChannelRows(orgId, "fr"))
    .returning();
  const channelBySlug = new Map(channelRows.map((c) => [c.slug, c]));
  // Where career-site applicants came from, without touching the random sequence.
  const channelFor = (person: number) =>
    channelBySlug.get(
      ["linkedin", "indeed", "", "welcome-to-the-jungle", "linkedin", "cooptation"][person % 6] ??
        "",
    ) ?? null;

  const tagRows = await db
    .insert(tags)
    .values(demoTags.map((name) => ({ organizationId: orgId, name })))
    .returning();

  // Jobs, stages and questions.
  const jobInfo = new Map<
    string,
    {
      id: string;
      title: string;
      stages: Record<StageKey, string>;
      questions: Array<{
        id: string;
        label: string;
        type: ApplicationAnswer["type"];
        options: string[];
      }>;
    }
  >();
  for (const job of demoJobs) {
    const published =
      job.key === "logistics"
        ? new Date(now - 720 * DAY)
        : new Date(now - job.publishedDaysAgo * DAY);
    const status = job.key === "logistics" ? "archived" : job.status;
    const [row] = await db
      .insert(jobs)
      .values({
        organizationId: orgId,
        title: job.title,
        slug: `${slugify(job.title, 60)}-${shortId(4)}`,
        descriptionHtml: job.descriptionHtml,
        department: job.department,
        location: job.location,
        remote: job.remote,
        contract: job.contract,
        salaryMin: job.salary?.min ?? null,
        salaryMax: job.salary?.max ?? null,
        salaryPeriod: job.salary?.period ?? "year",
        status,
        publishedAt: status === "draft" ? null : published,
        archivedAt: status === "archived" ? new Date(now - 640 * DAY) : null,
        createdById: users.admin,
        createdAt: published,
        updatedAt: published,
      })
      .returning();
    const stageRows = await db
      .insert(pipelineStages)
      .values(
        defaultStages("fr").map((s, position) => ({
          ...s,
          position,
          organizationId: orgId,
          jobId: row!.id,
        })),
      )
      .returning();
    const keys: StageKey[] = ["new", "screening", "interview", "offer", "hired", "rejected"];
    const stages = Object.fromEntries(stageRows.map((s, i) => [keys[i]!, s.id])) as Record<
      StageKey,
      string
    >;
    const questionRows = job.questions.length
      ? await db
          .insert(jobQuestions)
          .values(
            job.questions.map((q, position) => ({
              organizationId: orgId,
              jobId: row!.id,
              label: q.label,
              type: q.type,
              options: q.options ?? [],
              required: q.required,
              position,
            })),
          )
          .returning()
      : [];
    for (const key of job.members)
      await db
        .insert(jobMembers)
        .values({ organizationId: orgId, jobId: row!.id, userId: users[key]! });
    await db
      .insert(jobMembers)
      .values({ organizationId: orgId, jobId: row!.id, userId: users.recruiter! })
      .onConflictDoNothing();
    jobInfo.set(job.key, {
      id: row!.id,
      title: job.title,
      stages,
      questions: questionRows.map((q) => ({
        id: q.id,
        label: q.label,
        type: q.type,
        options: q.options,
      })),
    });
  }

  const candidateIds = new Map<number, string>();
  let noteIndex = 0;
  let order = 0;

  for (const entry of plan) {
    const job = jobInfo.get(entry.job)!;
    const [firstName, lastName, city] = demoPeople[entry.person]!;
    const email = `${slugify(firstName)}.${slugify(lastName)}@example.com`;
    const appliedAt = new Date(now - entry.daysAgo * DAY - Math.floor(random() * 8) * 3600 * 1000);
    const stageMovedAt = new Date(
      Math.min(now, appliedAt.getTime() + (1 + Math.floor(random() * 4)) * DAY),
    );
    const lastActivity = entry.stage === "new" ? appliedAt : stageMovedAt;

    let candidateId = candidateIds.get(entry.person);
    if (!candidateId) {
      const [c] = await db
        .insert(candidates)
        .values({
          organizationId: orgId,
          firstName,
          lastName,
          email,
          phone: `06 ${Math.floor(10 + random() * 89)} ${Math.floor(10 + random() * 89)} ${Math.floor(10 + random() * 89)} ${Math.floor(10 + random() * 89)}`,
          linkUrl:
            entry.job === "design"
              ? `https://portfolio.example/${slugify(firstName)}-${slugify(lastName)}`
              : random() > 0.5
                ? `https://www.linkedin.com/in/${slugify(firstName)}-${slugify(lastName)}`
                : null,
          lastActivityAt: lastActivity,
          createdAt: appliedAt,
        })
        .returning();
      candidateId = c!.id;
      candidateIds.set(entry.person, candidateId);
    } else if (lastActivity > appliedAt) {
      await db
        .update(candidates)
        .set({ lastActivityAt: lastActivity })
        .where(eq(candidates.id, candidateId));
    }

    const answers: ApplicationAnswer[] = job.questions.map((q) => ({
      questionId: q.id,
      label: q.label,
      type: q.type,
      value:
        q.type === "yes_no"
          ? random() > 0.25
            ? "yes"
            : "no"
          : q.type === "single_choice"
            ? pick(q.options)
            : q.label.includes("portfolio")
              ? `https://portfolio.example/${slugify(firstName)}`
              : q.label.includes("rythme")
                ? pick([
                    "Trois semaines en entreprise, une semaine à l'école",
                    "Deux jours à l'école, trois jours en entreprise",
                  ])
                : pick(["Mobilier de bureau", "Hôtellerie", "Décoration", "Équipement de cuisine"]),
    }));
    const rejected = entry.stage === "rejected";
    const reason = rejected ? pick(rejectionReasonsByStage) : null;
    const [app] = await db
      .insert(applications)
      .values({
        organizationId: orgId,
        candidateId,
        jobId: job.id,
        stageId: job.stages[entry.stage],
        position: entry.daysAgo + order++ / 1000,
        source: entry.person % 7 === 3 ? "manual" : "career_site",
        channelId: entry.person % 7 === 3 ? null : (channelFor(entry.person)?.id ?? null),
        channelName: entry.person % 7 === 3 ? null : (channelFor(entry.person)?.name ?? null),
        message:
          random() > 0.45
            ? pick([
                "Votre façon de travailler le bois massif me parle beaucoup. Je serais ravie d'en discuter.",
                "Je suis votre travail depuis plusieurs années et j'aimerais rejoindre l'équipe.",
                "Disponible rapidement, je peux venir à l'atelier quand vous le souhaitez.",
                "J'ai vu l'offre sur votre site et elle correspond exactement à ce que je cherche.",
              ])
            : null,
        answers,
        consentAt: appliedAt,
        consentText: `J'accepte que mes données soient utilisées par ${demoCompany.name} pour étudier ma candidature et conservées 24 mois au maximum.`,
        viewedAt: entry.viewed ? stageMovedAt : null,
        stageChangedAt: stageMovedAt,
        rejectedAt: rejected ? stageMovedAt : null,
        rejectionReason: reason,
        hiredAt: entry.stage === "hired" ? stageMovedAt : null,
        createdAt: appliedAt,
        updatedAt: stageMovedAt,
      })
      .returning();
    const applicationId = app!.id;

    // CV
    const profileKey = entry.job === "logistics" ? "sales" : entry.job;
    const profile = demoProfiles[profileKey]!;
    const year = 2026;
    const pdf = await renderCvPdf({
      name: `${firstName} ${lastName}`,
      headline: pick(profile.headlines),
      email,
      phone: "06 00 00 00 00",
      city,
      summary: pick([
        "Six ans d'expérience, attachée au travail bien fait et aux équipes à taille humaine.",
        "Curieux et rigoureux, je cherche un poste où le savoir-faire compte autant que les résultats.",
        "Trois ans d'expérience, dont deux dans une entreprise de fabrication française.",
        "Je termine ma formation et je cherche une entreprise où apprendre auprès de personnes expérimentées.",
      ]),
      experience: [
        {
          role: pick(profile.headlines),
          company: pick(profile.companies),
          period: `${year - 3} – ${year}`,
          points: [pick(profile.points), pick(profile.points)],
        },
        {
          role: pick(profile.headlines),
          company: pick(profile.companies),
          period: `${year - 6} – ${year - 3}`,
          points: [pick(profile.points)],
        },
      ],
      education: [
        { title: pick(profile.schools), school: city, period: `${year - 9} – ${year - 7}` },
      ],
      skills: [
        ...new Set([
          pick(profile.skills),
          pick(profile.skills),
          pick(profile.skills),
          pick(profile.skills),
        ]),
      ],
      languages:
        random() > 0.5
          ? ["Français", "Anglais courant"]
          : ["Français", "Anglais professionnel", "Espagnol"],
      labels: {
        experience: "Expérience",
        education: "Formation",
        skills: "Compétences",
        languages: "Langues",
      },
    });
    await storeCv(orgId, candidateId, applicationId, {
      name: `CV-${firstName}-${lastName}.pdf`,
      type: "application/pdf",
      size: pdf.length,
      data: pdf,
    });

    // History
    const history: Array<typeof activities.$inferInsert> = [
      {
        organizationId: orgId,
        candidateId,
        applicationId,
        jobId: job.id,
        type: "applied",
        data: {},
        createdAt: appliedAt,
      },
    ];
    const values = {
      firstName,
      lastName,
      job: job.title,
      company: demoCompany.name,
      recruiter: "Hugo Marchand",
    };
    await db.insert(emailMessages).values({
      organizationId: orgId,
      candidateId,
      applicationId,
      templateId: confirmation.id,
      toEmail: email,
      subject: renderTemplate(confirmation.subject, values),
      body: renderTemplate(confirmation.body, values),
      status: "logged",
      createdAt: new Date(appliedAt.getTime() + 60_000),
    });
    history.push({
      organizationId: orgId,
      candidateId,
      applicationId,
      jobId: job.id,
      type: "email_sent",
      data: {
        subject: renderTemplate(confirmation.subject, values),
        status: "logged",
        automatic: true,
      },
      createdAt: new Date(appliedAt.getTime() + 60_000),
    });
    if (entry.stage !== "new") {
      const to = {
        screening: "Présélection",
        interview: "Entretien",
        offer: "Offre",
        hired: "Embauché",
        rejected: "Refusé",
      }[entry.stage];
      history.push({
        organizationId: orgId,
        candidateId,
        applicationId,
        jobId: job.id,
        actorId: users.recruiter,
        type: rejected ? "rejected" : entry.stage === "hired" ? "hired" : "stage_changed",
        data: rejected ? { reason, from: "Nouveau", emailed: true } : { from: "Nouveau", to },
        createdAt: stageMovedAt,
      });
    }
    if (entry.stage === "interview" || entry.stage === "offer" || entry.stage === "hired") {
      await db.insert(emailMessages).values({
        organizationId: orgId,
        candidateId,
        applicationId,
        templateId: interview.id,
        toEmail: email,
        subject: renderTemplate(interview.subject, values),
        body: renderTemplate(interview.body, values),
        status: "logged",
        sentById: users.recruiter,
        createdAt: stageMovedAt,
      });
      history.push({
        organizationId: orgId,
        candidateId,
        applicationId,
        jobId: job.id,
        actorId: users.recruiter,
        type: "email_sent",
        data: { subject: renderTemplate(interview.subject, values), status: "logged" },
        createdAt: stageMovedAt,
      });
      // Evaluations: the recruiter and the hiring manager have given theirs; the demo admin not always.
      const raters: string[] = ["recruiter"];
      if (
        jobInfo.get(entry.job) &&
        demoJobs.find((j) => j.key === entry.job)?.members.includes("member")
      )
        raters.push("member");
      if (entry.person % 2 === 0) raters.push("admin");
      for (const rater of raters) {
        const rating =
          entry.stage === "interview" ? 3 + Math.floor(random() * 2) : 4 + Math.floor(random() * 2);
        await db.insert(evaluations).values({
          organizationId: orgId,
          applicationId,
          authorId: users[rater]!,
          rating: Math.min(5, rating),
          comment: pick([
            "Très à l'aise sur le fond, réponses précises. Je recommande la suite.",
            "Bonne énergie, quelques lacunes sur les outils mais rattrapables.",
            "Expérience solide et vraie envie de rejoindre une petite équipe.",
            "Excellente préparation, a posé les bonnes questions sur l'organisation de l'atelier.",
          ]),
          createdAt: new Date(stageMovedAt.getTime() + 3600_000),
          updatedAt: new Date(stageMovedAt.getTime() + 3600_000),
        });
        history.push({
          organizationId: orgId,
          candidateId,
          applicationId,
          jobId: job.id,
          actorId: users[rater],
          type: "evaluated",
          data: {},
          createdAt: new Date(stageMovedAt.getTime() + 3600_000),
        });
      }
    }
    if (rejected) {
      await db.insert(emailMessages).values({
        organizationId: orgId,
        candidateId,
        applicationId,
        templateId: rejection.id,
        toEmail: email,
        subject: renderTemplate(rejection.subject, values),
        body: renderTemplate(rejection.body, values),
        status: "logged",
        sentById: users.recruiter,
        createdAt: stageMovedAt,
      });
    }

    // Notes on a few active candidates.
    if (!rejected && entry.stage !== "new" && noteIndex < noteTexts.length && entry.daysAgo < 60) {
      const n = noteTexts[noteIndex++]!;
      const body = n.mention ? `<@${users[n.mention]}> ${n.text}` : n.text;
      const noteAt = new Date(stageMovedAt.getTime() + 2 * 3600_000);
      const [note] = await db
        .insert(notes)
        .values({
          organizationId: orgId,
          candidateId,
          applicationId,
          authorId: users[n.author],
          body,
          mentionedUserIds: n.mention ? [users[n.mention]!] : [],
          createdAt: noteAt,
          updatedAt: noteAt,
        })
        .returning();
      history.push({
        organizationId: orgId,
        candidateId,
        applicationId,
        jobId: job.id,
        actorId: users[n.author],
        type: "note_added",
        data: {},
        createdAt: noteAt,
      });
      if (n.mention) {
        await db.insert(notifications).values({
          organizationId: orgId,
          userId: users[n.mention]!,
          actorId: users[n.author],
          noteId: note!.id,
          candidateId,
          applicationId,
          createdAt: noteAt,
        });
      }
    }

    // Tags
    if (random() > 0.55) {
      const tag = pick(tagRows);
      await db
        .insert(candidateTags)
        .values({ organizationId: orgId, candidateId, tagId: tag.id })
        .onConflictDoNothing();
    }

    await db.insert(activities).values(history);
  }

  // The archived job's candidate is close to the end of the 24-month retention.
  const old = candidateIds.get(39);
  if (old)
    await db
      .update(candidates)
      .set({ lastActivityAt: new Date(now - 715 * DAY) })
      .where(eq(candidates.id, old));

  for (const id of candidateIds.values()) await refreshSearchText(db, id);
  return { created: true };
}
