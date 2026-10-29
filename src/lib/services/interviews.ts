import { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import {
  applications,
  candidates,
  emailMessages,
  evaluations,
  interviewAttendees,
  interviews,
  jobs,
  memberships,
  notifications,
  organizations,
  slotProposals,
  user,
  userCalendars,
  type LocationKind,
} from "@/lib/db/schema";
import { authSecret } from "@/lib/auth/secret";
import { busyIntervals, type Interval } from "@/lib/calendar/busy";
import { buildInvite, type InviteMethod } from "@/lib/calendar/ics";
import { freeSlots, suggestSlots } from "@/lib/calendar/slots";
import { appUrl, env } from "@/lib/env";
import { timeZone as appTimeZone } from "@/i18n/config";
import { serverTranslator } from "@/i18n/server";
import { deliver, textToHtml } from "@/lib/mail";
import { SafeFetchError, safeFetchText } from "@/lib/net/safe-fetch";
import { assertCan, NotFoundError } from "@/lib/permissions";
import { addDays, isValidDate, isValidTime, zonedDate } from "@/lib/time/zoned";
import { decryptSecret, encryptSecret, randomToken, sha256 } from "@/lib/utils/crypto";
import { jobAccess } from "./access";
import { logActivity } from "./activity";
import { ensureTemplate, sendCandidateEmails } from "./emails";
import type { TemplateValues } from "./template-render";
import type { Ctx } from "./types";

const timeZone = appTimeZone;
const BUSY_TTL = 10 * 60_000;
const BUSY_HORIZON_DAYS = 60;
/** A candidate cannot book a slot starting in less than this. */
const BOOKING_NOTICE = 60 * 60_000;
/** Slots offered start at least this far from now. */
const PROPOSAL_NOTICE = 12 * 3600_000;
/** A candidate can change slot until this long before the interview. */
const CHANGE_NOTICE = 24 * 3600_000;
export const DURATIONS = [30, 45, 60, 90] as const;

export class CalendarError extends Error {
  constructor(public readonly reason: "url" | "unreachable" | "invalid") {
    super(`Calendar error: ${reason}`);
    this.name = "CalendarError";
  }
}

export class SchedulingError extends Error {
  constructor(
    public readonly reason:
      | "interviewers"
      | "slots"
      | "duration"
      | "past"
      | "taken"
      | "closed"
      | "link"
      | "hours"
      | "no-email",
  ) {
    super(`Scheduling error: ${reason}`);
    this.name = "SchedulingError";
  }
}

/* --------------------------------- Calendars -------------------------------- */

const DEFAULT_HOURS = { workingDays: [1, 2, 3, 4, 5], workStart: "09:00", workEnd: "18:00" };

export async function getMyCalendar(ctx: Ctx) {
  const [row] = await db.select().from(userCalendars).where(eq(userCalendars.userId, ctx.userId));
  return {
    hasCalendar: Boolean(row?.icsUrlEncrypted),
    workingDays: row?.workingDays ?? DEFAULT_HOURS.workingDays,
    workStart: row?.workStart ?? DEFAULT_HOURS.workStart,
    workEnd: row?.workEnd ?? DEFAULT_HOURS.workEnd,
    meetingUrl: row?.meetingUrl ?? null,
    busyFetchedAt: row?.busyFetchedAt ?? null,
    busyError: row?.busyError ?? null,
    busyCount: row?.busy.length ?? 0,
  };
}

async function readFeed(url: string): Promise<Interval[]> {
  let text: string;
  try {
    text = await safeFetchText(url);
  } catch (error) {
    throw new CalendarError(
      error instanceof SafeFetchError && (error.reason === "url" || error.reason === "address")
        ? "url"
        : "unreachable",
    );
  }
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new CalendarError("invalid");
  try {
    const from = new Date();
    return busyIntervals(
      text,
      { from, to: new Date(from.getTime() + BUSY_HORIZON_DAYS * 86_400_000) },
      timeZone(),
    );
  } catch {
    throw new CalendarError("invalid");
  }
}

const serialise = (intervals: Interval[]) =>
  intervals.map((i) => ({ start: i.start.toISOString(), end: i.end.toISOString() }));

/**
 * Saves the viewer's availability. `icsUrl`: a new address (read at once to check it),
 * `null` to remove it, `undefined` to keep the current one.
 */
export async function saveMyCalendar(
  ctx: Ctx,
  input: {
    icsUrl?: string | null;
    workingDays: number[];
    workStart: string;
    workEnd: string;
    meetingUrl: string | null;
  },
) {
  const days = [...new Set(input.workingDays)].filter((d) => d >= 1 && d <= 7).sort();
  if (
    days.length === 0 ||
    !isValidTime(input.workStart) ||
    !isValidTime(input.workEnd) ||
    input.workStart >= input.workEnd
  )
    throw new SchedulingError("hours");
  const values: Partial<typeof userCalendars.$inferInsert> = {
    workingDays: days,
    workStart: input.workStart,
    workEnd: input.workEnd,
    meetingUrl: input.meetingUrl?.trim() || null,
  };
  if (input.icsUrl === null) {
    Object.assign(values, {
      icsUrlEncrypted: null,
      busy: [],
      busyFetchedAt: null,
      busyUntil: null,
      busyError: null,
    });
  } else if (input.icsUrl !== undefined) {
    const busy = await readFeed(input.icsUrl);
    const now = new Date();
    Object.assign(values, {
      icsUrlEncrypted: encryptSecret(input.icsUrl.trim(), authSecret()),
      busy: serialise(busy),
      busyFetchedAt: now,
      busyUntil: new Date(now.getTime() + BUSY_HORIZON_DAYS * 86_400_000),
      busyError: null,
    });
  }
  await db
    .insert(userCalendars)
    .values({ userId: ctx.userId, ...values })
    .onConflictDoUpdate({ target: userCalendars.userId, set: values });
  return getMyCalendar(ctx);
}

/** Busy times read from someone's calendar feed, at most 10 minutes old. */
async function calendarBusy(userId: string): Promise<{ busy: Interval[]; error: string | null }> {
  const [row] = await db.select().from(userCalendars).where(eq(userCalendars.userId, userId));
  if (!row?.icsUrlEncrypted) return { busy: [], error: null };
  const cached = row.busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  if (row.busyFetchedAt && Date.now() - row.busyFetchedAt.getTime() < BUSY_TTL)
    return { busy: cached, error: row.busyError };
  const url = decryptSecret(row.icsUrlEncrypted, authSecret());
  if (!url) {
    await db
      .update(userCalendars)
      .set({ busyError: "secret" })
      .where(eq(userCalendars.userId, userId));
    return { busy: cached, error: "secret" };
  }
  try {
    const busy = await readFeed(url);
    const now = new Date();
    await db
      .update(userCalendars)
      .set({
        busy: serialise(busy),
        busyFetchedAt: now,
        busyUntil: new Date(now.getTime() + BUSY_HORIZON_DAYS * 86_400_000),
        busyError: null,
      })
      .where(eq(userCalendars.userId, userId));
    return { busy, error: null };
  } catch (error) {
    const reason = error instanceof CalendarError ? error.reason : "unreachable";
    // Keep the last known busy times: better slightly stale than none.
    await db
      .update(userCalendars)
      .set({ busyError: reason, busyFetchedAt: new Date() })
      .where(eq(userCalendars.userId, userId));
    return { busy: cached, error: reason };
  }
}

/** Interviews already planned with these people, whatever the organisation. */
async function plannedBusy(userIds: string[], range: { from: Date; to: Date }, exclude?: string) {
  if (userIds.length === 0) return new Map<string, Interval[]>();
  const rows = await db
    .select({
      userId: interviewAttendees.userId,
      start: interviews.startsAt,
      end: interviews.endsAt,
    })
    .from(interviewAttendees)
    .innerJoin(interviews, eq(interviews.id, interviewAttendees.interviewId))
    .where(
      and(
        inArray(interviewAttendees.userId, userIds),
        eq(interviews.status, "scheduled"),
        lt(interviews.startsAt, range.to),
        gt(interviews.endsAt, range.from),
        exclude ? ne(interviews.id, exclude) : undefined,
      ),
    );
  const byUser = new Map<string, Interval[]>();
  for (const r of rows)
    byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), { start: r.start, end: r.end }]);
  return byUser;
}

/* -------------------------------- Interviewers ------------------------------ */

async function organisationMembers(orgId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > 6) throw new SchedulingError("interviewers");
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, locale: user.locale })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.organizationId, orgId), inArray(memberships.userId, unique)));
  if (rows.length !== unique.length) throw new SchedulingError("interviewers");
  return rows;
}

async function accessibleApplication(ctx: Ctx, applicationId: string) {
  const [row] = await db
    .select({
      id: applications.id,
      candidateId: applications.candidateId,
      jobId: applications.jobId,
      jobTitle: jobs.title,
      jobLocation: jobs.location,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      phone: candidates.phone,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.organizationId, ctx.orgId),
        jobAccess(ctx),
      ),
    );
  if (!row) throw new NotFoundError("Application");
  return row;
}

/* ----------------------------------- Slots ---------------------------------- */

/**
 * Times when every interviewer is free: working hours, minus their calendar's busy times,
 * minus interviews already planned in Open ATS.
 */
export async function findSlots(
  ctx: Ctx,
  input: {
    applicationId: string;
    interviewerIds: string[];
    durationMinutes: number;
    from: string;
    to: string;
  },
) {
  assertCan(ctx.role, "candidate:email");
  const application = await accessibleApplication(ctx, input.applicationId);
  if (!DURATIONS.includes(input.durationMinutes as (typeof DURATIONS)[number]))
    throw new SchedulingError("duration");
  if (!isValidDate(input.from) || !isValidDate(input.to) || input.to < input.from)
    throw new SchedulingError("slots");
  const to = input.to > addDays(input.from, 31) ? addDays(input.from, 31) : input.to;
  const people = await organisationMembers(ctx.orgId, input.interviewerIds);
  const range = {
    from: new Date(`${input.from}T00:00:00Z`),
    to: new Date(new Date(`${to}T00:00:00Z`).getTime() + 2 * 86_400_000),
  };
  const planned = await plannedBusy(
    people.map((p) => p.id),
    range,
  );
  const calendars = await db
    .select()
    .from(userCalendars)
    .where(
      inArray(
        userCalendars.userId,
        people.map((p) => p.id),
      ),
    );
  const interviewers = [];
  const status = [];
  for (const person of people) {
    const row = calendars.find((c) => c.userId === person.id);
    const fromCalendar = await calendarBusy(person.id);
    interviewers.push({
      workingDays: row?.workingDays ?? DEFAULT_HOURS.workingDays,
      workStart: row?.workStart ?? DEFAULT_HOURS.workStart,
      workEnd: row?.workEnd ?? DEFAULT_HOURS.workEnd,
      busy: [...fromCalendar.busy, ...(planned.get(person.id) ?? [])],
    });
    status.push({
      id: person.id,
      name: person.name,
      hasCalendar: Boolean(row?.icsUrlEncrypted),
      calendarError: fromCalendar.error,
      meetingUrl: row?.meetingUrl ?? null,
    });
  }
  const slots = freeSlots({
    from: input.from,
    to,
    timeZone: timeZone(),
    durationMinutes: input.durationMinutes,
    notBefore: new Date(Date.now() + PROPOSAL_NOTICE),
    interviewers,
  });
  return {
    timeZone: timeZone(),
    candidate: { firstName: application.firstName, phone: application.phone },
    jobLocation: application.jobLocation,
    slots: serialise(slots),
    suggested: serialise(suggestSlots(slots, timeZone())),
    interviewers: status,
  };
}

/* ------------------------------- Text helpers ------------------------------- */

function cityOf(zone: string) {
  return zone.split("/").pop()!.replace(/_/g, " ");
}

/** « jeudi 5 novembre 2026, 14:00 – 14:45 (heure de Paris) » */
export function interviewWhen(start: Date, end: Date, locale: "fr" | "en") {
  const zone = timeZone();
  const t = serverTranslator(locale, "interviews");
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start);
  const time = (d: Date) =>
    new Intl.DateTimeFormat(locale, { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(
      d,
    );
  return t("dateLine", {
    date,
    start: time(start),
    end: time(end),
    zone: t("zone", { city: cityOf(zone) }),
  });
}

export function locationLine(kind: LocationKind, location: string | null, locale: "fr" | "en") {
  const t = serverTranslator(locale, "interviews.locationLine");
  if (kind === "video") return location ? t("video", { location }) : t("videoNoLink");
  if (kind === "onsite") return location ? t("onsite", { location }) : t("onsiteNoAddress");
  return location ? t("phone", { location }) : t("phoneNoNumber");
}

function organizer(orgName: string) {
  const from = env().MAIL_FROM;
  return { name: orgName, email: from.match(/<([^>]+)>/)?.[1] ?? from };
}

const icsUid = (interviewId: string) => `${interviewId}@${new URL(env().APP_URL).hostname}`;

/* -------------------------------- Invitations ------------------------------- */

type InterviewFull = {
  interview: typeof interviews.$inferSelect;
  org: typeof organizations.$inferSelect;
  job: { id: string; title: string };
  candidate: { id: string; firstName: string; lastName: string; email: string | null };
  attendees: Array<{ id: string; name: string; email: string; locale: string | null }>;
};

async function loadInterview(interviewId: string, tx: Tx | typeof db = db): Promise<InterviewFull> {
  const [row] = await tx
    .select({
      interview: interviews,
      org: organizations,
      job: { id: jobs.id, title: jobs.title },
      candidate: {
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
      },
    })
    .from(interviews)
    .innerJoin(organizations, eq(organizations.id, interviews.organizationId))
    .innerJoin(jobs, eq(jobs.id, interviews.jobId))
    .innerJoin(candidates, eq(candidates.id, interviews.candidateId))
    .where(eq(interviews.id, interviewId));
  if (!row) throw new NotFoundError("Interview");
  const attendees = await tx
    .select({ id: user.id, name: user.name, email: user.email, locale: user.locale })
    .from(interviewAttendees)
    .innerJoin(user, eq(user.id, interviewAttendees.userId))
    .where(eq(interviewAttendees.interviewId, interviewId));
  return { ...row, attendees };
}

function inviteFor(
  full: InterviewFull,
  method: InviteMethod,
  audience: "candidate" | "team",
  locale: "fr" | "en",
) {
  const t = serverTranslator(locale, "interviews");
  const where = locationLine(full.interview.locationKind, full.interview.location, locale);
  const candidateName = `${full.candidate.firstName} ${full.candidate.lastName}`;
  const url = appUrl(`/jobs/${full.job.id}?a=${full.interview.applicationId}`);
  return buildInvite({
    method,
    uid: icsUid(full.interview.id),
    sequence: full.interview.sequence,
    start: full.interview.startsAt,
    end: full.interview.endsAt,
    summary:
      audience === "candidate"
        ? t("inviteCandidate", { company: full.org.name, job: full.job.title })
        : t("inviteTeam", { candidate: candidateName, job: full.job.title }),
    description:
      audience === "candidate"
        ? t("inviteCandidateBody", { location: where })
        : t("inviteTeamBody", { location: where, url }),
    location:
      full.interview.locationKind === "phone" ? where : (full.interview.location ?? undefined),
    url:
      full.interview.locationKind === "video" ? (full.interview.location ?? undefined) : undefined,
    organizer: organizer(full.org.name),
    attendees: [
      ...(full.candidate.email ? [{ name: candidateName, email: full.candidate.email }] : []),
      ...full.attendees.map((a) => ({ name: a.name, email: a.email })),
    ],
  });
}

/** Each interviewer receives the event; these emails go to the team journal. */
async function inviteTeam(full: InterviewFull, method: InviteMethod, actorId: string | null) {
  for (const person of full.attendees) {
    const locale = person.locale === "en" ? "en" : "fr";
    const t = serverTranslator(locale, "interviews.teamEmail");
    const when = interviewWhen(full.interview.startsAt, full.interview.endsAt, locale);
    const candidate = `${full.candidate.firstName} ${full.candidate.lastName}`;
    const date = new Intl.DateTimeFormat(locale, {
      timeZone: timeZone(),
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(full.interview.startsAt);
    const values = {
      candidate,
      job: full.job.title,
      when,
      date,
      location: locationLine(full.interview.locationKind, full.interview.location, locale),
      url: appUrl(`/jobs/${full.job.id}?a=${full.interview.applicationId}`),
    };
    const subject = method === "CANCEL" ? t("cancelSubject", values) : t("subject", values);
    const text = method === "CANCEL" ? t("cancelBody", values) : t("body", values);
    const result = await deliver({
      to: person.email,
      subject,
      text,
      html: textToHtml(text),
      fromName: full.org.name,
      icalEvent: { method, content: inviteFor(full, method, "team", locale) },
    });
    await db.insert(emailMessages).values({
      organizationId: full.org.id,
      category: "team",
      toEmail: person.email,
      subject,
      body: text,
      status: result.status,
      error: result.error,
      sentById: actorId,
    });
  }
}

/** The candidate's confirmation (template « booked ») with the event attached. */
async function confirmToCandidate(
  full: InterviewFull,
  ctx: Ctx,
  email: { subject: string; body: string; templateId: string | null } | null,
  automatic: boolean,
) {
  if (!full.candidate.email) return;
  const template = email ?? (await ensureTemplate(full.org.id, "booked"));
  if (!template) return;
  const values: TemplateValues = {
    interviewDate: interviewWhen(full.interview.startsAt, full.interview.endsAt, full.org.locale),
    interviewLocation: locationLine(
      full.interview.locationKind,
      full.interview.location,
      full.org.locale,
    ),
  };
  await sendCandidateEmails(
    ctx,
    {
      applicationIds: [full.interview.applicationId],
      subject: template.subject,
      body: template.body,
      templateId: "id" in template ? template.id : template.templateId,
      values,
      icalEvent: {
        method: "REQUEST",
        content: inviteFor(full, "REQUEST", "candidate", full.org.locale),
      },
    },
    { skipPermission: true, automatic },
  );
}

/* ----------------------------- Planning by the team ------------------------- */

type LocationInput = { locationKind: LocationKind; location: string | null };

function cleanLocation(input: LocationInput) {
  const location = input.location?.trim().slice(0, 500) || null;
  if (input.locationKind === "video" && location && !/^https?:\/\//i.test(location))
    throw new SchedulingError("link");
  return { locationKind: input.locationKind, location };
}

async function createInterview(
  tx: Tx,
  values: {
    orgId: string;
    applicationId: string;
    candidateId: string;
    jobId: string;
    start: Date;
    end: Date;
    location: LocationInput;
    interviewerIds: string[];
    proposalId: string | null;
    createdById: string | null;
  },
) {
  const [row] = await tx
    .insert(interviews)
    .values({
      organizationId: values.orgId,
      applicationId: values.applicationId,
      candidateId: values.candidateId,
      jobId: values.jobId,
      startsAt: values.start,
      endsAt: values.end,
      locationKind: values.location.locationKind,
      location: values.location.location,
      proposalId: values.proposalId,
      createdById: values.createdById,
    })
    .returning({ id: interviews.id });
  await tx.insert(interviewAttendees).values(
    values.interviewerIds.map((userId) => ({
      organizationId: values.orgId,
      interviewId: row!.id,
      userId,
    })),
  );
  return row!.id;
}

/** Serialises bookings touching the same people, then checks they are still free. */
async function lockAndCheck(
  tx: Tx,
  interviewerIds: string[],
  start: Date,
  end: Date,
  exclude?: string,
) {
  for (const id of [...interviewerIds].sort())
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`interviewer:${id}`}))`);
  const [clash] = await tx
    .select({ id: interviews.id })
    .from(interviews)
    .innerJoin(interviewAttendees, eq(interviewAttendees.interviewId, interviews.id))
    .where(
      and(
        inArray(interviewAttendees.userId, interviewerIds),
        eq(interviews.status, "scheduled"),
        lt(interviews.startsAt, end),
        gt(interviews.endsAt, start),
        exclude ? ne(interviews.id, exclude) : undefined,
      ),
    )
    .limit(1);
  if (clash) throw new SchedulingError("taken");
}

/** Sets a date directly: invitations go to everyone at once. */
export async function scheduleInterview(
  ctx: Ctx,
  input: LocationInput & {
    applicationId: string;
    interviewerIds: string[];
    start: string;
    durationMinutes: number;
    email: { subject: string; body: string; templateId: string | null } | null;
  },
) {
  assertCan(ctx.role, "candidate:email");
  const application = await accessibleApplication(ctx, input.applicationId);
  if (!application.email) throw new SchedulingError("no-email");
  if (!DURATIONS.includes(input.durationMinutes as (typeof DURATIONS)[number]))
    throw new SchedulingError("duration");
  const start = new Date(input.start);
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now())
    throw new SchedulingError("past");
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const people = await organisationMembers(ctx.orgId, input.interviewerIds);
  const location = cleanLocation(input);
  const interviewId = await db.transaction(async (tx) => {
    await lockAndCheck(
      tx,
      people.map((p) => p.id),
      start,
      end,
    );
    return createInterview(tx, {
      orgId: ctx.orgId,
      applicationId: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      start,
      end,
      location,
      interviewerIds: people.map((p) => p.id),
      proposalId: null,
      createdById: ctx.userId,
    });
  });
  const full = await loadInterview(interviewId);
  await confirmToCandidate(full, ctx, input.email, false);
  await inviteTeam(full, "REQUEST", ctx.userId);
  await logActivity(db, ctx, {
    candidateId: application.candidateId,
    applicationId: application.id,
    jobId: application.jobId,
    type: "interview_scheduled",
    data: { start: start.toISOString() },
  });
  return { id: interviewId };
}

/** Offers a choice of slots: the candidate picks one on a page of the career site. */
export async function proposeSlots(
  ctx: Ctx,
  input: LocationInput & {
    applicationId: string;
    interviewerIds: string[];
    durationMinutes: number;
    slots: string[];
    email: { subject: string; body: string; templateId: string | null };
  },
) {
  assertCan(ctx.role, "candidate:email");
  const application = await accessibleApplication(ctx, input.applicationId);
  if (!application.email) throw new SchedulingError("no-email");
  if (!DURATIONS.includes(input.durationMinutes as (typeof DURATIONS)[number]))
    throw new SchedulingError("duration");
  const people = await organisationMembers(ctx.orgId, input.interviewerIds);
  const starts = [...new Set(input.slots)]
    .map((s) => new Date(s))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (starts.length === 0 || starts.length > 20) throw new SchedulingError("slots");
  if (starts[0]!.getTime() < Date.now() + BOOKING_NOTICE) throw new SchedulingError("past");
  const location = cleanLocation(input);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const token = randomToken(24);
  const slots = starts.map((start) => ({
    start: start.toISOString(),
    end: new Date(start.getTime() + input.durationMinutes * 60_000).toISOString(),
  }));
  const proposal = await db.transaction(async (tx) => {
    // One open proposal per application: a new one replaces the previous.
    await tx
      .update(slotProposals)
      .set({ status: "cancelled" })
      .where(
        and(eq(slotProposals.applicationId, application.id), eq(slotProposals.status, "open")),
      );
    const [row] = await tx
      .insert(slotProposals)
      .values({
        organizationId: ctx.orgId,
        applicationId: application.id,
        candidateId: application.candidateId,
        jobId: application.jobId,
        tokenHash: sha256(token),
        tokenEncrypted: encryptSecret(token, authSecret()),
        durationMinutes: input.durationMinutes,
        slots,
        interviewerIds: people.map((p) => p.id),
        ...location,
        expiresAt: starts[starts.length - 1]!,
        createdById: ctx.userId,
      })
      .returning({ id: slotProposals.id });
    return row!;
  });
  const url = appUrl(`/careers/${org!.slug}/interview/${token}`);
  await sendCandidateEmails(ctx, {
    applicationIds: [application.id],
    ...input.email,
    values: { slotsLink: url },
  });
  await logActivity(db, ctx, {
    candidateId: application.candidateId,
    applicationId: application.id,
    jobId: application.jobId,
    type: "slots_proposed",
    data: { count: slots.length },
  });
  return { id: proposal.id, url };
}

export async function cancelProposal(ctx: Ctx, proposalId: string) {
  assertCan(ctx.role, "candidate:email");
  const [row] = await db
    .update(slotProposals)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(slotProposals.id, proposalId),
        eq(slotProposals.organizationId, ctx.orgId),
        eq(slotProposals.status, "open"),
      ),
    )
    .returning({ id: slotProposals.id });
  if (!row) throw new NotFoundError("Proposal");
}

export async function cancelInterview(ctx: Ctx, interviewId: string) {
  assertCan(ctx.role, "candidate:email");
  const [row] = await db
    .update(interviews)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      sequence: sql`${interviews.sequence} + 1`,
    })
    .where(
      and(
        eq(interviews.id, interviewId),
        eq(interviews.organizationId, ctx.orgId),
        eq(interviews.status, "scheduled"),
      ),
    )
    .returning({ id: interviews.id, proposalId: interviews.proposalId });
  if (!row) throw new NotFoundError("Interview");
  if (row.proposalId)
    await db
      .update(slotProposals)
      .set({ status: "cancelled" })
      .where(eq(slotProposals.id, row.proposalId));
  const full = await loadInterview(interviewId);
  const locale = full.org.locale;
  if (full.candidate.email) {
    const t = serverTranslator(locale, "interviews.cancelCandidate");
    const when = interviewWhen(full.interview.startsAt, full.interview.endsAt, locale);
    await sendCandidateEmails(
      ctx,
      {
        applicationIds: [full.interview.applicationId],
        subject: t("subject", { job: full.job.title }),
        body: t("body", {
          firstName: full.candidate.firstName,
          when,
          job: full.job.title,
          company: full.org.name,
        }),
        icalEvent: { method: "CANCEL", content: inviteFor(full, "CANCEL", "candidate", locale) },
      },
      { skipPermission: true },
    );
  }
  await inviteTeam(full, "CANCEL", ctx.userId);
  await logActivity(db, ctx, {
    candidateId: full.candidate.id,
    applicationId: full.interview.applicationId,
    jobId: full.job.id,
    type: "interview_cancelled",
    data: { start: full.interview.startsAt.toISOString() },
  });
}

/* ------------------------------ Candidate booking --------------------------- */

async function proposalByToken(orgSlug: string, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({ proposal: slotProposals, org: organizations, job: jobs })
    .from(slotProposals)
    .innerJoin(organizations, eq(organizations.id, slotProposals.organizationId))
    .innerJoin(jobs, eq(jobs.id, slotProposals.jobId))
    .where(and(eq(slotProposals.tokenHash, sha256(token)), eq(organizations.slug, orgSlug)));
  return row ?? null;
}

/** What the candidate sees on the booking page. */
export async function getPublicProposal(orgSlug: string, token: string) {
  const row = await proposalByToken(orgSlug, token);
  if (!row) return null;
  const { proposal, org, job } = row;
  const [interview] = proposal.interviewId
    ? await db.select().from(interviews).where(eq(interviews.id, proposal.interviewId))
    : [];
  const booked = proposal.status === "booked" && interview?.status === "scheduled";
  const canChange = booked && interview!.startsAt.getTime() - Date.now() > CHANGE_NOTICE;
  let available: Interval[] = [];
  if (proposal.status === "open" || canChange) {
    const now = Date.now();
    const offered = proposal.slots
      .map((s) => ({ start: new Date(s.start), end: new Date(s.end) }))
      .filter((s) => s.start.getTime() > now + BOOKING_NOTICE);
    if (offered.length > 0) {
      const planned = await plannedBusy(
        proposal.interviewerIds,
        { from: offered[0]!.start, to: offered[offered.length - 1]!.end },
        interview?.id,
      );
      const taken = [...planned.values()].flat();
      available = offered.filter((s) => !taken.some((b) => b.start < s.end && b.end > s.start));
    }
  }
  return {
    org: { name: org.name, slug: org.slug, locale: org.locale },
    job: { title: job.title },
    status: booked
      ? ("booked" as const)
      : proposal.status === "open"
        ? ("open" as const)
        : ("closed" as const),
    durationMinutes: proposal.durationMinutes,
    locationKind: proposal.locationKind,
    location: proposal.location,
    timeZone: timeZone(),
    interview: booked
      ? { startsAt: interview!.startsAt, endsAt: interview!.endsAt, canChange }
      : null,
    available: serialise(available),
  };
}

export type PublicProposal = NonNullable<Awaited<ReturnType<typeof getPublicProposal>>>;

/** The candidate takes a slot, or moves to another one while it is allowed. */
export async function bookSlot(orgSlug: string, token: string, start: string) {
  const row = await proposalByToken(orgSlug, token);
  if (!row) throw new NotFoundError("Proposal");
  const startAt = new Date(start);
  const result = await db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(slotProposals)
      .where(eq(slotProposals.id, row.proposal.id))
      .for("update");
    if (!proposal) throw new NotFoundError("Proposal");
    const slot = proposal.slots.find((s) => new Date(s.start).getTime() === startAt.getTime());
    if (!slot) throw new SchedulingError("slots");
    if (startAt.getTime() < Date.now() + BOOKING_NOTICE) throw new SchedulingError("past");
    const endAt = new Date(slot.end);
    const [current] = proposal.interviewId
      ? await tx.select().from(interviews).where(eq(interviews.id, proposal.interviewId))
      : [];
    const rebooking = proposal.status === "booked" && current?.status === "scheduled";
    if (!rebooking && proposal.status !== "open") throw new SchedulingError("closed");
    if (rebooking && current!.startsAt.getTime() - Date.now() <= CHANGE_NOTICE)
      throw new SchedulingError("closed");
    await lockAndCheck(tx, proposal.interviewerIds, startAt, endAt, current?.id);
    if (rebooking) {
      await tx
        .update(interviews)
        .set({ startsAt: startAt, endsAt: endAt, sequence: sql`${interviews.sequence} + 1` })
        .where(eq(interviews.id, current!.id));
      return { interviewId: current!.id, proposal, rebooked: true };
    }
    const interviewId = await createInterview(tx, {
      orgId: proposal.organizationId,
      applicationId: proposal.applicationId,
      candidateId: proposal.candidateId,
      jobId: proposal.jobId,
      start: startAt,
      end: endAt,
      location: { locationKind: proposal.locationKind, location: proposal.location },
      interviewerIds: proposal.interviewerIds,
      proposalId: proposal.id,
      createdById: proposal.createdById,
    });
    await tx
      .update(slotProposals)
      .set({ status: "booked", interviewId })
      .where(eq(slotProposals.id, proposal.id));
    return { interviewId, proposal, rebooked: false };
  });

  const full = await loadInterview(result.interviewId);
  const ctx: Ctx = {
    orgId: full.org.id,
    userId: result.proposal.createdById ?? "",
    role: "admin",
  };
  await confirmToCandidate(full, ctx, null, true);
  await inviteTeam(full, "REQUEST", null);
  const recipients = [
    ...new Set([...result.proposal.interviewerIds, result.proposal.createdById].filter(Boolean)),
  ] as string[];
  if (recipients.length > 0)
    await db.insert(notifications).values(
      recipients.map((userId) => ({
        organizationId: full.org.id,
        userId,
        type: "interview_booked" as const,
        interviewId: full.interview.id,
        candidateId: full.candidate.id,
        applicationId: full.interview.applicationId,
      })),
    );
  await logActivity(
    db,
    { orgId: full.org.id },
    {
      candidateId: full.candidate.id,
      applicationId: full.interview.applicationId,
      jobId: full.job.id,
      type: "interview_scheduled",
      data: { start: full.interview.startsAt.toISOString(), byCandidate: true },
    },
  );
  return { interviewId: result.interviewId, rebooked: result.rebooked };
}

/** The booked interview as a file for the candidate's calendar. */
export async function publicInterviewIcs(orgSlug: string, token: string) {
  const row = await proposalByToken(orgSlug, token);
  if (!row?.proposal.interviewId) return null;
  const full = await loadInterview(row.proposal.interviewId);
  if (full.interview.status !== "scheduled") return null;
  return inviteFor(full, "PUBLISH", "candidate", full.org.locale);
}

/* ---------------------------------- Lists ----------------------------------- */

async function attendeesOf(interviewIds: string[]) {
  if (interviewIds.length === 0) return new Map<string, Array<{ id: string; name: string }>>();
  const rows = await db
    .select({ interviewId: interviewAttendees.interviewId, id: user.id, name: user.name })
    .from(interviewAttendees)
    .innerJoin(user, eq(user.id, interviewAttendees.userId))
    .where(inArray(interviewAttendees.interviewId, interviewIds))
    .orderBy(asc(user.name));
  const map = new Map<string, Array<{ id: string; name: string }>>();
  for (const r of rows)
    map.set(r.interviewId, [...(map.get(r.interviewId) ?? []), { id: r.id, name: r.name }]);
  return map;
}

/** Interviews and open proposals of an application, for the candidate panel. */
export async function listApplicationScheduling(ctx: Ctx, applicationId: string) {
  const list = await db
    .select()
    .from(interviews)
    .where(
      and(eq(interviews.applicationId, applicationId), eq(interviews.organizationId, ctx.orgId)),
    )
    .orderBy(desc(interviews.startsAt));
  const attendees = await attendeesOf(list.map((i) => i.id));
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId));
  const proposals = await db
    .select()
    .from(slotProposals)
    .where(
      and(
        eq(slotProposals.applicationId, applicationId),
        eq(slotProposals.organizationId, ctx.orgId),
        eq(slotProposals.status, "open"),
        gt(slotProposals.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(slotProposals.createdAt));
  return {
    timeZone: timeZone(),
    interviews: list.map((i) => ({
      id: i.id,
      startsAt: i.startsAt,
      endsAt: i.endsAt,
      locationKind: i.locationKind,
      location: i.location,
      status: i.status,
      attendees: attendees.get(i.id) ?? [],
    })),
    proposals: proposals.map((p) => {
      const token = decryptSecret(p.tokenEncrypted, authSecret());
      return {
        id: p.id,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
        slotCount: p.slots.filter((s) => new Date(s.start).getTime() > Date.now()).length,
        url: token ? appUrl(`/careers/${org!.slug}/interview/${token}`) : null,
      };
    }),
  };
}

/** Next planned interview of each application of a board. */
export async function nextInterviews(ctx: Ctx, applicationIds: string[]) {
  if (applicationIds.length === 0) return new Map<string, Date>();
  const rows = await db
    .select({
      applicationId: interviews.applicationId,
      next: sql<Date>`min(${interviews.startsAt})`.mapWith((v: string) => new Date(v)),
    })
    .from(interviews)
    .where(
      and(
        eq(interviews.organizationId, ctx.orgId),
        inArray(interviews.applicationId, applicationIds),
        eq(interviews.status, "scheduled"),
        gte(interviews.endsAt, new Date()),
      ),
    )
    .groupBy(interviews.applicationId);
  return new Map(rows.map((r) => [r.applicationId, r.next]));
}

/** The Interviews page: upcoming, waiting for an answer, to evaluate. */
export async function listInterviewsOverview(ctx: Ctx, scope: "mine" | "team") {
  const everyone = scope === "team" && ctx.role !== "member";
  const now = new Date();
  const base = db
    .select({
      id: interviews.id,
      startsAt: interviews.startsAt,
      endsAt: interviews.endsAt,
      locationKind: interviews.locationKind,
      location: interviews.location,
      applicationId: interviews.applicationId,
      candidateId: interviews.candidateId,
      jobId: interviews.jobId,
      jobTitle: jobs.title,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
    })
    .from(interviews)
    .innerJoin(jobs, eq(jobs.id, interviews.jobId))
    .innerJoin(candidates, eq(candidates.id, interviews.candidateId));
  const mine = everyone
    ? undefined
    : sql`exists (select 1 from ${interviewAttendees} ia where ia.interview_id = ${interviews.id} and ia.user_id = ${ctx.userId})`;
  const upcoming = await base
    .where(
      and(
        eq(interviews.organizationId, ctx.orgId),
        eq(interviews.status, "scheduled"),
        gte(interviews.endsAt, now),
        jobAccess(ctx),
        mine,
      ),
    )
    .orderBy(asc(interviews.startsAt))
    .limit(200);
  const past = await base
    .where(
      and(
        eq(interviews.organizationId, ctx.orgId),
        eq(interviews.status, "scheduled"),
        lt(interviews.endsAt, now),
        gt(interviews.endsAt, new Date(now.getTime() - 21 * 86_400_000)),
        sql`exists (select 1 from ${interviewAttendees} ia where ia.interview_id = ${interviews.id} and ia.user_id = ${ctx.userId})`,
        sql`not exists (select 1 from ${evaluations} e where e.application_id = ${interviews.applicationId} and e.author_id = ${ctx.userId})`,
      ),
    )
    .orderBy(desc(interviews.startsAt))
    .limit(50);
  const pending = await db
    .select({
      id: slotProposals.id,
      createdAt: slotProposals.createdAt,
      expiresAt: slotProposals.expiresAt,
      applicationId: slotProposals.applicationId,
      candidateId: slotProposals.candidateId,
      jobId: slotProposals.jobId,
      jobTitle: jobs.title,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
    })
    .from(slotProposals)
    .innerJoin(jobs, eq(jobs.id, slotProposals.jobId))
    .innerJoin(candidates, eq(candidates.id, slotProposals.candidateId))
    .where(
      and(
        eq(slotProposals.organizationId, ctx.orgId),
        eq(slotProposals.status, "open"),
        gt(slotProposals.expiresAt, now),
        jobAccess(ctx),
        everyone
          ? undefined
          : sql`(${slotProposals.createdById} = ${ctx.userId} or ${ctx.userId} = any(${slotProposals.interviewerIds}))`,
      ),
    )
    .orderBy(asc(slotProposals.expiresAt));
  const attendees = await attendeesOf(upcoming.map((i) => i.id));
  return {
    upcoming: upcoming.map((i) => ({ ...i, attendees: attendees.get(i.id) ?? [] })),
    toEvaluate: past,
    pending,
    timeZone: timeZone(),
  };
}

export { zonedDate };
