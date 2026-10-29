import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  activities,
  emailMessages,
  interviewAttendees,
  interviews,
  notifications,
  organizations,
} from "@/lib/db/schema";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import {
  bookSlot,
  CalendarError,
  cancelInterview,
  cancelProposal,
  findSlots,
  getMyCalendar,
  getPublicProposal,
  listApplicationScheduling,
  listInterviewsOverview,
  proposeSlots,
  saveMyCalendar,
  scheduleInterview,
  SchedulingError,
} from "@/lib/services/interviews";
import type { Ctx } from "@/lib/services/types";
import { addDays, weekdayOf, zonedDate, zonedToUtc } from "@/lib/time/zoned";
import { addMember, apply, createTenant, publishedJob } from "../helpers";

const TZ = "Europe/Paris";

/** The next weekday at least `daysAhead` days from now, as YYYY-MM-DD. */
function workday(daysAhead: number) {
  let day = addDays(zonedDate(new Date(), TZ), daysAhead);
  while (weekdayOf(day) > 5) day = addDays(day, 1);
  return day;
}

const email = {
  subject: "Entretien {{offre}}",
  body: "Choisissez : {{lien_creneaux}}",
  templateId: null,
};

describe("interview scheduling", () => {
  let ctx: Ctx;
  let other: Ctx;
  let recruiter: Ctx;
  let job: { id: string };
  let app: { candidateId: string; applicationId: string };
  let orgSlug: string;
  let server: Server;
  let feedUrl: string;
  const busyDay = workday(3);

  beforeAll(async () => {
    ctx = await createTenant("Entretiens");
    other = await createTenant("Ailleurs");
    recruiter = await addMember(ctx, "recruiter", "Hugo Recruteur");
    job = await publishedJob(ctx, "Ébéniste");
    app = await apply(ctx, job.id, {
      firstName: "Marion",
      lastName: "Lefort",
      email: "marion.interview@example.test",
    });
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    orgSlug = org!.slug;
    const compact = busyDay.replace(/-/g, "");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:busy@test",
      `DTSTART:${compact}T080000Z`,
      `DTEND:${compact}T160000Z`,
      "SUMMARY:Salon",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    server = createServer((req, res) => {
      if (req.url === "/calendar.ics") {
        res.writeHead(200, { "Content-Type": "text/calendar" });
        res.end(ics);
      } else if (req.url === "/not-a-calendar") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html></html>");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    feedUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => server.close());

  it("reads a calendar feed and refuses what is not one", async () => {
    await expect(
      saveMyCalendar(ctx, {
        icsUrl: `${feedUrl}/not-a-calendar`,
        workingDays: [1, 2, 3, 4, 5],
        workStart: "09:00",
        workEnd: "18:00",
        meetingUrl: null,
      }),
    ).rejects.toBeInstanceOf(CalendarError);
    await expect(
      saveMyCalendar(ctx, {
        icsUrl: "ftp://calendar.example/feed.ics",
        workingDays: [1, 2, 3, 4, 5],
        workStart: "09:00",
        workEnd: "18:00",
        meetingUrl: null,
      }),
    ).rejects.toMatchObject({ reason: "url" });
    const saved = await saveMyCalendar(ctx, {
      icsUrl: `${feedUrl}/calendar.ics`,
      workingDays: [1, 2, 3, 4, 5],
      workStart: "09:00",
      workEnd: "18:00",
      meetingUrl: "https://meet.example/camille",
    });
    expect(saved.hasCalendar).toBe(true);
    expect(saved.busyCount).toBe(1);
    expect((await getMyCalendar(ctx)).meetingUrl).toBe("https://meet.example/camille");
    await expect(
      saveMyCalendar(ctx, {
        workingDays: [],
        workStart: "09:00",
        workEnd: "18:00",
        meetingUrl: null,
      }),
    ).rejects.toBeInstanceOf(SchedulingError);
  });

  it("offers only times when every interviewer is free", async () => {
    const found = await findSlots(ctx, {
      applicationId: app.applicationId,
      interviewerIds: [ctx.userId, recruiter.userId],
      durationMinutes: 60,
      from: busyDay,
      to: addDays(busyDay, 1),
    });
    const onBusyDay = found.slots.filter((s) => zonedDate(new Date(s.start), TZ) === busyDay);
    // Busy 08:00–16:00 UTC: on a winter or summer day only the end of the afternoon is left.
    expect(onBusyDay.every((s) => new Date(s.start) >= new Date(`${busyDay}T16:00:00Z`))).toBe(
      true,
    );
    expect(found.interviewers.find((i) => i.id === ctx.userId)!.hasCalendar).toBe(true);
    expect(found.interviewers.find((i) => i.id === recruiter.userId)!.hasCalendar).toBe(false);
    expect(found.suggested.length).toBeGreaterThan(0);
  });

  it("lets the candidate book a slot, then invites everyone and tells the team", async () => {
    const day = workday(5);
    const slots = ["10:00", "14:00"].map((t) => zonedToUtc(day, t, TZ).toISOString());
    const { url } = await proposeSlots(ctx, {
      applicationId: app.applicationId,
      interviewerIds: [ctx.userId, recruiter.userId],
      durationMinutes: 45,
      locationKind: "video",
      location: "https://meet.example/camille",
      slots,
      email,
    });
    const token = url.split("/").pop()!;
    const [sent] = await db
      .select()
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.applicationId, app.applicationId),
          eq(emailMessages.subject, "Entretien Ébéniste"),
        ),
      );
    expect(sent!.body).toBe(`Choisissez : ${url}`);

    const page = await getPublicProposal(orgSlug, token);
    expect(page!.status).toBe("open");
    expect(page!.available.map((s) => s.start)).toEqual(slots);
    expect(await getPublicProposal("wrong-org", token)).toBeNull();
    expect(await getPublicProposal(orgSlug, "x".repeat(32))).toBeNull();

    const booked = await bookSlot(orgSlug, token, slots[1]!);
    const [interview] = await db
      .select()
      .from(interviews)
      .where(eq(interviews.id, booked.interviewId));
    expect(interview!.startsAt.toISOString()).toBe(slots[1]);
    expect(interview!.endsAt.getTime() - interview!.startsAt.getTime()).toBe(45 * 60_000);
    const attendees = await db
      .select()
      .from(interviewAttendees)
      .where(eq(interviewAttendees.interviewId, booked.interviewId));
    expect(attendees.map((a) => a.userId).sort()).toEqual([ctx.userId, recruiter.userId].sort());
    const told = await db
      .select()
      .from(notifications)
      .where(eq(notifications.interviewId, booked.interviewId));
    expect(told.map((n) => n.userId).sort()).toEqual([ctx.userId, recruiter.userId].sort());
    const confirmation = await db
      .select()
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.applicationId, app.applicationId),
          eq(emailMessages.category, "candidate"),
        ),
      );
    expect(confirmation.some((m) => m.subject.startsWith("Entretien confirmé"))).toBe(true);
    const team = await db
      .select()
      .from(emailMessages)
      .where(and(eq(emailMessages.organizationId, ctx.orgId), eq(emailMessages.category, "team")));
    expect(team.length).toBeGreaterThanOrEqual(2);

    const after = await getPublicProposal(orgSlug, token);
    expect(after!.status).toBe("booked");
    expect(after!.interview!.canChange).toBe(true);
    expect(after!.available.map((s) => s.start)).toEqual(slots);

    // Changing slot moves the same event: one interview, a higher sequence.
    const moved = await bookSlot(orgSlug, token, slots[0]!);
    expect(moved).toEqual({ interviewId: booked.interviewId, rebooked: true });
    const [updated] = await db
      .select()
      .from(interviews)
      .where(eq(interviews.id, booked.interviewId));
    expect(updated!.startsAt.toISOString()).toBe(slots[0]);
    expect(updated!.sequence).toBe(1);
    await expect(
      bookSlot(orgSlug, token, zonedToUtc(day, "16:00", TZ).toISOString()),
    ).rejects.toMatchObject({
      reason: "slots",
    });

    const scheduling = await listApplicationScheduling(ctx, app.applicationId);
    expect(scheduling.interviews).toHaveLength(1);
    expect(scheduling.proposals).toHaveLength(0);
    const overview = await listInterviewsOverview(recruiter, "mine");
    expect(overview.upcoming.map((i) => i.id)).toContain(booked.interviewId);
  });

  it("never lets two candidates take the same interviewer at the same time", async () => {
    const day = workday(7);
    const slot = zonedToUtc(day, "11:00", TZ).toISOString();
    const second = await apply(ctx, job.id, {
      firstName: "Paul",
      lastName: "Durand",
      email: "paul.interview@example.test",
    });
    const first = await proposeSlots(ctx, {
      applicationId: app.applicationId,
      interviewerIds: [recruiter.userId],
      durationMinutes: 30,
      locationKind: "onsite",
      location: "12 rue de l'Atelier, Lyon",
      slots: [slot],
      email,
    });
    const other = await proposeSlots(ctx, {
      applicationId: second.applicationId,
      interviewerIds: [recruiter.userId],
      durationMinutes: 30,
      locationKind: "phone",
      location: null,
      slots: [slot],
      email,
    });
    const results = await Promise.allSettled([
      bookSlot(orgSlug, first.url.split("/").pop()!, slot),
      bookSlot(orgSlug, other.url.split("/").pop()!, slot),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ reason: "taken" });
  });

  it("sets a date directly, then cancels it", async () => {
    const start = zonedToUtc(workday(9), "15:00", TZ).toISOString();
    const { id } = await scheduleInterview(ctx, {
      applicationId: app.applicationId,
      interviewerIds: [ctx.userId],
      start,
      durationMinutes: 60,
      locationKind: "onsite",
      location: "Atelier",
      email: null,
    });
    await expect(
      scheduleInterview(ctx, {
        applicationId: app.applicationId,
        interviewerIds: [ctx.userId],
        start,
        durationMinutes: 30,
        locationKind: "onsite",
        location: null,
        email: null,
      }),
    ).rejects.toMatchObject({ reason: "taken" });
    await cancelInterview(ctx, id);
    const [row] = await db.select().from(interviews).where(eq(interviews.id, id));
    expect(row!.status).toBe("cancelled");
    expect(row!.sequence).toBe(1);
    const history = await db
      .select({ type: activities.type })
      .from(activities)
      .where(eq(activities.applicationId, app.applicationId));
    expect(history.map((h) => h.type)).toEqual(
      expect.arrayContaining(["slots_proposed", "interview_scheduled", "interview_cancelled"]),
    );
    await expect(
      scheduleInterview(ctx, {
        applicationId: app.applicationId,
        interviewerIds: [ctx.userId],
        start: new Date(Date.now() - 3600_000).toISOString(),
        durationMinutes: 30,
        locationKind: "video",
        location: null,
        email: null,
      }),
    ).rejects.toMatchObject({ reason: "past" });
  });

  it("refuses people outside the organisation, members and other organisations", async () => {
    const outsider = await createTenant("Externe");
    await expect(
      findSlots(ctx, {
        applicationId: app.applicationId,
        interviewerIds: [outsider.userId],
        durationMinutes: 30,
        from: workday(2),
        to: workday(4),
      }),
    ).rejects.toMatchObject({ reason: "interviewers" });
    const member = await addMember(ctx, "member");
    await expect(
      proposeSlots(member, {
        applicationId: app.applicationId,
        interviewerIds: [member.userId],
        durationMinutes: 30,
        locationKind: "video",
        location: null,
        slots: [zonedToUtc(workday(4), "10:00", TZ).toISOString()],
        email,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      findSlots(other, {
        applicationId: app.applicationId,
        interviewerIds: [other.userId],
        durationMinutes: 30,
        from: workday(2),
        to: workday(4),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    const proposal = await proposeSlots(ctx, {
      applicationId: app.applicationId,
      interviewerIds: [ctx.userId],
      durationMinutes: 30,
      locationKind: "video",
      location: "pas un lien",
      slots: [zonedToUtc(workday(4), "10:00", TZ).toISOString()],
      email,
    }).catch((e) => e);
    expect(proposal).toMatchObject({ reason: "link" });
    const { interviews: theirs } = await listApplicationScheduling(other, app.applicationId);
    expect(theirs).toEqual([]);
    const [mine] = await db
      .select()
      .from(interviews)
      .where(eq(interviews.applicationId, app.applicationId));
    await expect(cancelInterview(other, mine!.id)).rejects.toBeInstanceOf(NotFoundError);
    const open = await proposeSlots(ctx, {
      applicationId: app.applicationId,
      interviewerIds: [ctx.userId],
      durationMinutes: 30,
      locationKind: "video",
      location: null,
      slots: [zonedToUtc(workday(4), "16:00", TZ).toISOString()],
      email,
    });
    await expect(cancelProposal(other, open.id)).rejects.toBeInstanceOf(NotFoundError);
    await cancelProposal(ctx, open.id);
    const page = await getPublicProposal(orgSlug, open.url.split("/").pop()!);
    expect(page!.status).toBe("closed");
  });
});
