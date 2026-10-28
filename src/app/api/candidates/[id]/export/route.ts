import { getApiContext } from "@/lib/context";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import { isUuid } from "@/lib/services/access";
import { exportCandidate } from "@/lib/services/gdpr";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/candidates/[id]/export">,
) {
  const ctx = await getApiContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  try {
    const { fileName, zip } = await exportCandidate(ctx, id);
    return new Response(Buffer.from(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
    throw error;
  }
}
