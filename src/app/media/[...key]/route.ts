import { isPublicKey, storage } from "@/lib/storage";

const types: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** Public organisation assets: logo and cover photo. Private files never match. */
export async function GET(_request: Request, { params }: RouteContext<"/media/[...key]">) {
  const { key: parts } = await params;
  const key = parts.map(decodeURIComponent).join("/");
  if (!isPublicKey(key)) return new Response("Not found", { status: 404 });
  const stream = await storage().stream(key);
  if (!stream) return new Response("Not found", { status: 404 });
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return new Response(stream, {
    headers: {
      "Content-Type": types[ext] ?? "application/octet-stream",
      // Keys contain a random part and change on every upload.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ...(ext === "svg" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}),
    },
  });
}
