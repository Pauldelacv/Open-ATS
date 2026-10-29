import { getApiContext } from "@/lib/context";
import { quickSearch } from "@/lib/services/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await getApiContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return Response.json({ jobs: [], candidates: [] });
  return Response.json(await quickSearch(ctx, q), { headers: { "Cache-Control": "no-store" } });
}
