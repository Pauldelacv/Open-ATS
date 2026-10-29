import { NotFoundError } from "@/lib/permissions";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { bookSlot, SchedulingError } from "@/lib/services/interviews";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** The candidate confirms a time slot. */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/careers/[org]/interview/[token]">,
) {
  const { org, token } = await params;
  if (!rateLimit(`book:${clientIp(request)}`, 10, 10 * 60_000))
    return json({ ok: false, error: "server" }, 429);
  let start: unknown;
  try {
    start = ((await request.json()) as { start?: unknown }).start;
  } catch {
    return json({ ok: false, error: "slots" }, 400);
  }
  if (typeof start !== "string" || Number.isNaN(new Date(start).getTime()))
    return json({ ok: false, error: "slots" }, 400);
  try {
    await bookSlot(org, token, start);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof SchedulingError) return json({ ok: false, error: error.reason }, 409);
    if (error instanceof NotFoundError) return json({ ok: false, error: "closed" }, 404);
    console.error("[booking] failed", error);
    return json({ ok: false, error: "server" }, 500);
  }
}
