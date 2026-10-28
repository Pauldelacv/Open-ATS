import { relations, sql, type SQL } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* -------------------------------------------------------------------------- */
/* Better Auth core tables (names and fields expected by the adapter)          */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  locale: text(),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* -------------------------------------------------------------------------- */
/* Organisation and team                                                      */
/* -------------------------------------------------------------------------- */

export type Locale = "fr" | "en";
export type Role = "admin" | "recruiter" | "member";

export const organizations = pgTable("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  locale: text().$type<Locale>().notNull().default("fr"),
  brandColor: text().notNull().default("#2447D6"),
  headingFont: text().$type<"serif" | "sans">().notNull().default("serif"),
  logoKey: text(),
  coverKey: text(),
  tagline: text(),
  descriptionHtml: text().notNull().default(""),
  websiteUrl: text(),
  privacyContactEmail: text(),
  retentionMonths: integer().notNull().default(24),
  sendConfirmationEmail: boolean().notNull().default(true),
  isDemo: boolean().notNull().default(false),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text().$type<Role>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text().$type<Role>().notNull(),
    tokenHash: text().notNull().unique(),
    invitedById: text().references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("invitations_org_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.email),
  ],
);

/* -------------------------------------------------------------------------- */
/* Jobs and pipeline                                                          */
/* -------------------------------------------------------------------------- */

export type JobStatus = "draft" | "published" | "archived";
export type RemotePolicy = "onsite" | "hybrid" | "remote";
export type ContractType = "cdi" | "cdd" | "freelance" | "apprenticeship" | "internship";
export type SalaryPeriod = "year" | "month" | "day" | "hour";
export type QuestionType = "short_text" | "long_text" | "yes_no" | "single_choice";
export type StageKind = "new" | "active" | "hired" | "rejected";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text().notNull(),
    slug: text().notNull(),
    descriptionHtml: text().notNull().default(""),
    department: text(),
    location: text(),
    remote: text().$type<RemotePolicy>().notNull().default("onsite"),
    contract: text().$type<ContractType>().notNull().default("cdi"),
    salaryMin: integer(),
    salaryMax: integer(),
    salaryCurrency: text().notNull().default("EUR"),
    salaryPeriod: text().$type<SalaryPeriod>().notNull().default("year"),
    status: text().$type<JobStatus>().notNull().default("draft"),
    publishedAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),
    createdById: text().references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("jobs_org_slug_uq").on(t.organizationId, t.slug),
    index("jobs_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const jobQuestions = pgTable(
  "job_questions",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    label: text().notNull(),
    type: text().$type<QuestionType>().notNull(),
    options: jsonb().$type<string[]>().notNull().default([]),
    required: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("job_questions_job_idx").on(t.jobId)],
);

export const jobMembers = pgTable(
  "job_members",
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.userId] }), index("job_members_user_idx").on(t.userId)],
);

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: text().$type<StageKind>().notNull().default("active"),
    position: integer().notNull(),
    ...timestamps,
  },
  (t) => [index("pipeline_stages_job_idx").on(t.jobId)],
);

/* -------------------------------------------------------------------------- */
/* Candidates and applications                                                */
/* -------------------------------------------------------------------------- */

export type ApplicationSource = "career_site" | "manual" | "demo";

export type ApplicationAnswer = {
  questionId: string;
  label: string;
  type: QuestionType;
  value: string;
};

export const candidates = pgTable(
  "candidates",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text().notNull(),
    lastName: text().notNull(),
    // Stored lower-cased; null once the candidate is anonymised.
    email: text(),
    phone: text(),
    linkUrl: text(),
    searchText: text().notNull().default(""),
    searchVector: tsvector().generatedAlwaysAs(
      (): SQL => sql`to_tsvector('simple', ${candidates.searchText})`,
    ),
    lastActivityAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    anonymizedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("candidates_org_email_uq").on(t.organizationId, t.email),
    index("candidates_org_activity_idx").on(t.organizationId, t.lastActivityAt),
    index("candidates_search_idx").using("gin", t.searchVector),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    candidateId: uuid()
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    stageId: uuid()
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "restrict" }),
    position: doublePrecision().notNull().default(0),
    source: text().$type<ApplicationSource>().notNull().default("career_site"),
    message: text(),
    answers: jsonb().$type<ApplicationAnswer[]>().notNull().default([]),
    consentAt: timestamp({ withTimezone: true }),
    consentText: text(),
    viewedAt: timestamp({ withTimezone: true }),
    stageChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    rejectedAt: timestamp({ withTimezone: true }),
    rejectionReason: text(),
    hiredAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("applications_job_candidate_uq").on(t.jobId, t.candidateId),
    index("applications_org_idx").on(t.organizationId),
    index("applications_stage_idx").on(t.stageId),
    index("applications_candidate_idx").on(t.candidateId),
  ],
);

export type FileKind = "cv" | "attachment";

export const files = pgTable(
  "files",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    candidateId: uuid()
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    applicationId: uuid().references(() => applications.id, { onDelete: "set null" }),
    kind: text().$type<FileKind>().notNull().default("cv"),
    storageKey: text().notNull(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    size: integer().notNull(),
    textContent: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_candidate_idx").on(t.candidateId)],
);

/* -------------------------------------------------------------------------- */
/* Collaboration                                                              */
/* -------------------------------------------------------------------------- */

export const notes = pgTable(
  "notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    candidateId: uuid()
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    applicationId: uuid().references(() => applications.id, { onDelete: "set null" }),
    authorId: text().references(() => user.id, { onDelete: "set null" }),
    body: text().notNull(),
    mentionedUserIds: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [index("notes_candidate_idx").on(t.candidateId)],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tags_org_name_uq").on(t.organizationId, sql`lower(${t.name})`)],
);

export const candidateTags = pgTable(
  "candidate_tags",
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    candidateId: uuid()
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    tagId: uuid()
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.candidateId, t.tagId] }),
    index("candidate_tags_tag_idx").on(t.tagId),
  ],
);

export const evaluations = pgTable(
  "evaluations",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    authorId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rating: integer().notNull(),
    comment: text().notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("evaluations_application_author_uq").on(t.applicationId, t.authorId)],
);

export type ActivityType =
  | "applied"
  | "reapplied"
  | "added"
  | "stage_changed"
  | "rejected"
  | "unrejected"
  | "hired"
  | "note_added"
  | "evaluated"
  | "email_sent"
  | "tag_added"
  | "tag_removed"
  | "cv_added"
  | "exported"
  | "anonymized";

export const activities = pgTable(
  "activities",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    candidateId: uuid()
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    applicationId: uuid().references(() => applications.id, { onDelete: "set null" }),
    jobId: uuid().references(() => jobs.id, { onDelete: "set null" }),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    type: text().$type<ActivityType>().notNull(),
    data: jsonb().$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_candidate_idx").on(t.candidateId, t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/* Emails and notifications                                                   */
/* -------------------------------------------------------------------------- */

export type EmailTemplateKind = "confirmation" | "rejection" | "interview" | "other";
export type EmailStatus = "sent" | "logged" | "failed";
export type EmailCategory = "candidate" | "team";

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: text().$type<EmailTemplateKind>().notNull().default("other"),
    subject: text().notNull(),
    body: text().notNull(),
    ...timestamps,
  },
  (t) => [index("email_templates_org_idx").on(t.organizationId)],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    category: text().$type<EmailCategory>().notNull().default("candidate"),
    candidateId: uuid().references(() => candidates.id, { onDelete: "cascade" }),
    applicationId: uuid().references(() => applications.id, { onDelete: "set null" }),
    templateId: uuid().references(() => emailTemplates.id, { onDelete: "set null" }),
    toEmail: text().notNull(),
    subject: text().notNull(),
    body: text().notNull(),
    status: text().$type<EmailStatus>().notNull(),
    error: text(),
    sentById: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_messages_org_idx").on(t.organizationId, t.createdAt),
    index("email_messages_candidate_idx").on(t.candidateId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actorId: text().references(() => user.id, { onDelete: "set null" }),
    type: text().$type<"mention">().notNull().default("mention"),
    noteId: uuid().references(() => notes.id, { onDelete: "cascade" }),
    candidateId: uuid()
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    applicationId: uuid().references(() => applications.id, { onDelete: "set null" }),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(memberships),
}));

export const organizationRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  jobs: many(jobs),
}));

export const membershipRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(user, { fields: [memberships.userId], references: [user.id] }),
}));

export const jobRelations = relations(jobs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [jobs.organizationId],
    references: [organizations.id],
  }),
  questions: many(jobQuestions),
  stages: many(pipelineStages),
  members: many(jobMembers),
  applications: many(applications),
}));

export const jobQuestionRelations = relations(jobQuestions, ({ one }) => ({
  job: one(jobs, { fields: [jobQuestions.jobId], references: [jobs.id] }),
}));

export const jobMemberRelations = relations(jobMembers, ({ one }) => ({
  job: one(jobs, { fields: [jobMembers.jobId], references: [jobs.id] }),
  user: one(user, { fields: [jobMembers.userId], references: [user.id] }),
}));

export const stageRelations = relations(pipelineStages, ({ one, many }) => ({
  job: one(jobs, { fields: [pipelineStages.jobId], references: [jobs.id] }),
  applications: many(applications),
}));

export const candidateRelations = relations(candidates, ({ many }) => ({
  applications: many(applications),
  files: many(files),
  notes: many(notes),
  tags: many(candidateTags),
}));

export const applicationRelations = relations(applications, ({ one, many }) => ({
  candidate: one(candidates, { fields: [applications.candidateId], references: [candidates.id] }),
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
  stage: one(pipelineStages, { fields: [applications.stageId], references: [pipelineStages.id] }),
  evaluations: many(evaluations),
}));

export const fileRelations = relations(files, ({ one }) => ({
  candidate: one(candidates, { fields: [files.candidateId], references: [candidates.id] }),
}));

export const noteRelations = relations(notes, ({ one }) => ({
  candidate: one(candidates, { fields: [notes.candidateId], references: [candidates.id] }),
  author: one(user, { fields: [notes.authorId], references: [user.id] }),
}));

export const candidateTagRelations = relations(candidateTags, ({ one }) => ({
  candidate: one(candidates, { fields: [candidateTags.candidateId], references: [candidates.id] }),
  tag: one(tags, { fields: [candidateTags.tagId], references: [tags.id] }),
}));

export const evaluationRelations = relations(evaluations, ({ one }) => ({
  application: one(applications, {
    fields: [evaluations.applicationId],
    references: [applications.id],
  }),
  author: one(user, { fields: [evaluations.authorId], references: [user.id] }),
}));

/** Tables that hold tenant data. Every one of them must carry `organization_id`. */
export const tenantTables = {
  memberships,
  invitations,
  jobs,
  jobQuestions,
  jobMembers,
  pipelineStages,
  candidates,
  applications,
  files,
  notes,
  tags,
  candidateTags,
  evaluations,
  activities,
  emailTemplates,
  emailMessages,
  notifications,
};
