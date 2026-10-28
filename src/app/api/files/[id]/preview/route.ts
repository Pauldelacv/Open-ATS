import { docxToHtml } from "@/lib/cv-text";
import { getApiContext } from "@/lib/context";
import { NotFoundError } from "@/lib/permissions";
import { isUuid } from "@/lib/services/access";
import { getAccessibleFile } from "@/lib/services/files";
import { storage } from "@/lib/storage";

/** HTML rendering of a DOCX CV for the preview pane. */
export async function GET(_request: Request, { params }: RouteContext<"/api/files/[id]/preview">) {
  const ctx = await getApiContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const file = await getAccessibleFile(ctx, id);
    if (!file.mimeType.includes("wordprocessingml"))
      return Response.json({ error: "unsupported" }, { status: 415 });
    const data = await storage().get(file.storageKey);
    if (!data) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(
      { html: await docxToHtml(data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof NotFoundError)
      return Response.json({ error: "not_found" }, { status: 404 });
    throw error;
  }
}
