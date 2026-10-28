import { z } from "zod";
import { fieldErrorsFrom } from "@/lib/actions";
import { getApiContext } from "@/lib/context";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import { isUuid } from "@/lib/services/access";
import { AlreadyAppliedError, addCandidateToJob } from "@/lib/services/manual-candidate";
import { CvRejectedError } from "@/lib/services/public-application";
import { cvError } from "@/lib/validation/application";

const schema = z.object({
  firstName: z.string().trim().min(1, "careers.errors.firstName").max(80),
  lastName: z.string().trim().min(1, "careers.errors.lastName").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "careers.errors.email")
    .transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
  linkUrl: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null),
});

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/jobs/[jobId]/candidates">,
) {
  const ctx = await getApiContext();
  if (!ctx) return Response.json({ ok: false, error: "common.forbidden" }, { status: 401 });
  const { jobId } = await params;
  if (!isUuid(jobId))
    return Response.json({ ok: false, error: "common.notFound" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  if (!form)
    return Response.json({ ok: false, error: "careers.errors.invalidForm" }, { status: 400 });
  const parsed = schema.safeParse({
    firstName: form.get("firstName") ?? "",
    lastName: form.get("lastName") ?? "",
    email: form.get("email") ?? "",
    phone: form.get("phone") ?? "",
    linkUrl: form.get("linkUrl") ?? "",
  });
  const file = form.get("cv");
  const cv = file instanceof File && file.size > 0 ? file : null;
  const fileError = cv ? cvError({ name: cv.name, type: cv.type, size: cv.size }) : null;
  if (!parsed.success || fileError) {
    const fieldErrors = parsed.success ? {} : fieldErrorsFrom(parsed.error.issues);
    if (fileError) fieldErrors.cv = fileError;
    return Response.json({ ok: false, error: "form", fieldErrors }, { status: 422 });
  }
  try {
    const result = await addCandidateToJob(
      ctx,
      jobId,
      parsed.data,
      cv
        ? { name: cv.name, type: cv.type, size: cv.size, data: Buffer.from(await cv.arrayBuffer()) }
        : null,
    );
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof AlreadyAppliedError)
      return Response.json({ ok: false, error: "pipeline.manual.exists" }, { status: 409 });
    if (error instanceof CvRejectedError)
      return Response.json(
        { ok: false, error: "form", fieldErrors: { cv: "careers.errors.cvInvalid" } },
        { status: 422 },
      );
    if (error instanceof ForbiddenError)
      return Response.json({ ok: false, error: "common.forbidden" }, { status: 403 });
    if (error instanceof NotFoundError)
      return Response.json({ ok: false, error: "common.notFound" }, { status: 404 });
    throw error;
  }
}
