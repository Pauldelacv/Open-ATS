import { getApiContext } from "@/lib/context";
import { NotFoundError } from "@/lib/permissions";
import { isUuid } from "@/lib/services/access";
import { getApplicationDetail } from "@/lib/services/candidates";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/api/applications/[id]">) {
  const ctx = await getApiContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const detail = await getApplicationDetail(ctx, id);
    return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    throw error;
  }
}
