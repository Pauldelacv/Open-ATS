import { serverTranslator } from "@/i18n/server";
import { fieldErrorsFrom } from "@/lib/actions";
import { getPublishedJob } from "@/lib/services/jobs";
import { getPublicOrganization } from "@/lib/services/organizations";
import { CvRejectedError, submitPublicApplication } from "@/lib/services/public-application";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { applicationSchema, cvError, MAX_CV_BYTES } from "@/lib/validation/application";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/careers/[org]/jobs/[slug]/apply">,
) {
  const { org: orgSlug, slug } = await params;
  const org = await getPublicOrganization(orgSlug);
  const job = org ? await getPublishedJob(org.id, slug) : null;
  if (!org || !job) return json({ ok: false, error: "careers.errors.jobClosed" }, 404);

  if (!rateLimit(`apply:${clientIp(request)}`, 8, 10 * 60_000)) {
    return json({ ok: false, error: "careers.errors.rateLimited" }, 429);
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_CV_BYTES + 512 * 1024)
    return json({ ok: false, error: "careers.errors.cvInvalid" }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "careers.errors.invalidForm" }, 400);
  }

  // Honeypot: bots fill every field. Pretend everything went well.
  if (String(form.get("website") ?? "") !== "") return json({ ok: true });

  const answers: Record<string, string> = {};
  for (const q of job.questions) answers[q.id] = String(form.get(`answer:${q.id}`) ?? "");
  const parsed = applicationSchema(job.questions).safeParse({
    firstName: form.get("firstName") ?? "",
    lastName: form.get("lastName") ?? "",
    email: form.get("email") ?? "",
    phone: form.get("phone") ?? "",
    link: form.get("link") ?? "",
    message: form.get("message") ?? "",
    answers,
    consent: form.get("consent") === "on" || form.get("consent") === "true",
  });
  const file = form.get("cv");
  const cv = file instanceof File ? file : null;
  const fileError = cvError(cv ? { name: cv.name, type: cv.type, size: cv.size } : null);
  if (!parsed.success || fileError) {
    const fieldErrors = parsed.success ? {} : fieldErrorsFrom(parsed.error.issues);
    if (fileError) fieldErrors.cv = fileError;
    return json({ ok: false, error: "careers.errors.fixFields", fieldErrors }, 422);
  }

  const t = serverTranslator(org.locale, "careers.apply");
  const consentText = t("consent", { company: org.name, months: org.retentionMonths });
  try {
    await submitPublicApplication({
      organizationId: org.id,
      jobId: job.id,
      questions: job.questions,
      data: parsed.data,
      cv: {
        name: cv!.name,
        type: cv!.type,
        size: cv!.size,
        data: Buffer.from(await cv!.arrayBuffer()),
      },
      consentText,
      source: String(form.get("source") ?? "") || null,
    });
  } catch (error) {
    if (error instanceof CvRejectedError) {
      return json(
        {
          ok: false,
          error: "careers.errors.fixFields",
          fieldErrors: { cv: "careers.errors.cvInvalid" },
        },
        422,
      );
    }
    console.error("[apply] failed", error);
    return json({ ok: false, error: "careers.errors.server" }, 500);
  }
  return json({ ok: true });
}
