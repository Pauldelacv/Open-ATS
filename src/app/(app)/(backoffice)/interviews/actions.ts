"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, failFrom, ok, type ActionResult } from "@/lib/actions";
import { requireContext } from "@/lib/context";
import {
  CalendarError,
  cancelInterview,
  cancelProposal,
  findSlots,
  getMyCalendar,
  proposeSlots,
  saveMyCalendar,
  scheduleInterview,
  SchedulingError,
} from "@/lib/services/interviews";
import type { EmailTemplateKind } from "@/lib/db/schema";
import { usesVariable } from "@/lib/services/template-render";
import { ensureTemplate, listTemplates } from "@/lib/services/emails";
import { videoMeetingBase } from "@/lib/env";
import { timeZone } from "@/i18n/config";

function failScheduling(error: unknown) {
  if (error instanceof SchedulingError) return fail(`interviews.dialog.errors.${error.reason}`);
  if (error instanceof CalendarError) return fail(`interviews.calendar.errors.${error.reason}`);
  return failFrom(error);
}

const location = {
  locationKind: z.enum(["video", "onsite", "phone"]),
  location: z.string().max(500).nullable(),
};
const people = z.array(z.string().min(1).max(100)).min(1).max(6);
const message = z.object({
  subject: z.string().trim().min(1, "emailComposer.errors.subject").max(300),
  body: z.string().trim().min(1, "emailComposer.errors.body").max(20_000),
  templateId: z.string().uuid().nullable(),
});

export async function findSlotsAction(input: {
  applicationId: string;
  interviewerIds: string[];
  durationMinutes: number;
  from: string;
  to: string;
}): Promise<ActionResult<Awaited<ReturnType<typeof findSlots>>>> {
  const ctx = await requireContext();
  try {
    const parsed = z
      .object({
        applicationId: z.string().uuid(),
        interviewerIds: people,
        durationMinutes: z.number().int(),
        from: z.string(),
        to: z.string(),
      })
      .parse(input);
    return ok(await findSlots(ctx, parsed));
  } catch (error) {
    if (error instanceof z.ZodError) return fail("interviews.dialog.errors.interviewers");
    return failScheduling(error);
  }
}

export async function proposeSlotsAction(input: {
  applicationId: string;
  interviewerIds: string[];
  durationMinutes: number;
  locationKind: "video" | "onsite" | "phone";
  location: string | null;
  slots: string[];
  email: { subject: string; body: string; templateId: string | null };
}): Promise<ActionResult<{ url: string }>> {
  const ctx = await requireContext();
  const parsed = z
    .object({
      applicationId: z.string().uuid(),
      interviewerIds: people,
      durationMinutes: z.number().int(),
      slots: z.array(z.string()).min(1, "interviews.dialog.errors.slots").max(20),
      email: message,
      ...location,
    })
    .safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    if (issue.path[0] === "email") return fail("form", { [String(issue.path[1])]: issue.message });
    return fail(issue.message.includes(".") ? issue.message : "interviews.dialog.errors.slots");
  }
  if (!usesVariable(parsed.data.email.body, "slotsLink"))
    return fail("form", { body: "interviews.dialog.errors.missingLink" });
  try {
    const result = await proposeSlots(ctx, parsed.data);
    revalidatePath("/interviews");
    return ok({ url: result.url });
  } catch (error) {
    return failScheduling(error);
  }
}

export async function scheduleInterviewAction(input: {
  applicationId: string;
  interviewerIds: string[];
  start: string;
  durationMinutes: number;
  locationKind: "video" | "onsite" | "phone";
  location: string | null;
  email: { subject: string; body: string; templateId: string | null };
}): Promise<ActionResult> {
  const ctx = await requireContext();
  const parsed = z
    .object({
      applicationId: z.string().uuid(),
      interviewerIds: people,
      start: z.string().datetime(),
      durationMinutes: z.number().int(),
      email: message,
      ...location,
    })
    .safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    if (issue.path[0] === "email") return fail("form", { [String(issue.path[1])]: issue.message });
    return fail(
      issue.path[0] === "start" ? "interviews.dialog.errors.past" : "common.unknownError",
    );
  }
  try {
    await scheduleInterview(ctx, parsed.data);
    revalidatePath("/interviews");
    return ok();
  } catch (error) {
    return failScheduling(error);
  }
}

export async function cancelInterviewAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await cancelInterview(ctx, z.string().uuid().parse(id));
    revalidatePath("/interviews");
    return ok();
  } catch (error) {
    return failScheduling(error);
  }
}

export async function cancelProposalAction(id: string): Promise<ActionResult> {
  const ctx = await requireContext();
  try {
    await cancelProposal(ctx, z.string().uuid().parse(id));
    revalidatePath("/interviews");
    return ok();
  } catch (error) {
    return failScheduling(error);
  }
}

export async function saveCalendarAction(input: {
  icsUrl?: string | null;
  workingDays: number[];
  workStart: string;
  workEnd: string;
  meetingUrl: string | null;
}): Promise<ActionResult> {
  const ctx = await requireContext();
  const parsed = z
    .object({
      icsUrl: z.string().trim().max(2000).nullable().optional(),
      workingDays: z.array(z.number().int().min(1).max(7)).max(7),
      workStart: z.string(),
      workEnd: z.string(),
      meetingUrl: z
        .string()
        .trim()
        .max(500)
        .refine((v) => v === "" || /^https?:\/\//i.test(v), "interviews.dialog.errors.link")
        .nullable(),
    })
    .safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return fail("form", {
      [String(issue.path[0])]: issue.message.includes(".")
        ? issue.message
        : "interviews.dialog.errors.hours",
    });
  }
  try {
    await saveMyCalendar(ctx, {
      ...parsed.data,
      icsUrl: parsed.data.icsUrl === "" ? undefined : parsed.data.icsUrl,
    });
    revalidatePath("/settings/profile");
    return ok();
  } catch (error) {
    if (error instanceof CalendarError)
      return fail("form", { icsUrl: `interviews.calendar.errors.${error.reason}` });
    if (error instanceof SchedulingError)
      return fail("form", { workStart: "interviews.dialog.errors.hours" });
    return failFrom(error);
  }
}

/** What the planning dialog needs once: own video room, link generator, zone, templates. */
export async function schedulingDefaultsAction(): Promise<
  ActionResult<{
    meetingUrl: string | null;
    videoBase: string | null;
    timeZone: string;
    templates: Array<{
      id: string;
      name: string;
      kind: EmailTemplateKind;
      subject: string;
      body: string;
    }>;
  }>
> {
  const ctx = await requireContext();
  try {
    const [calendar, slotsTemplate, bookedTemplate, templates] = await Promise.all([
      getMyCalendar(ctx),
      ensureTemplate(ctx.orgId, "slots"),
      ensureTemplate(ctx.orgId, "booked"),
      listTemplates(ctx),
    ]);
    const all = templates.filter((t) => t.kind === "slots" || t.kind === "booked");
    for (const extra of [slotsTemplate, bookedTemplate])
      if (extra && !all.some((t) => t.id === extra.id)) all.push(extra);
    return ok({
      meetingUrl: calendar.meetingUrl,
      videoBase: videoMeetingBase(),
      timeZone: timeZone(),
      templates: all.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        subject: t.subject,
        body: t.body,
      })),
    });
  } catch (error) {
    return failFrom(error);
  }
}
