import { trackedSource } from "@/lib/careers";
import { organizationFeed } from "@/lib/services/distribution";

export const dynamic = "force-dynamic";

/** Published jobs in the Indeed-style XML format read by job aggregators. */
export async function GET(request: Request, { params }: RouteContext<"/careers/[org]/jobs.xml">) {
  const { org } = await params;
  const source = trackedSource(new URL(request.url).searchParams.get("src") ?? undefined);
  const xml = await organizationFeed(org, source);
  if (xml === null) return new Response("Not found", { status: 404 });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
  });
}
