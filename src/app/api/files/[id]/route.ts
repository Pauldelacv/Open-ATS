import { getApiContext } from "@/lib/context";
import { NotFoundError } from "@/lib/permissions";
import { isUuid } from "@/lib/services/access";
import { getAccessibleFile } from "@/lib/services/files";
import { storage } from "@/lib/storage";

export async function GET(request: Request, { params }: RouteContext<"/api/files/[id]">) {
  const ctx = await getApiContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  try {
    const file = await getAccessibleFile(ctx, id);
    const stream = await storage().stream(file.storageKey);
    if (!stream) return new Response("Not found", { status: 404 });
    const download = new URL(request.url).searchParams.has("download");
    const name = encodeURIComponent(file.fileName);
    return new Response(stream, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      },
    });
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
    throw error;
  }
}
