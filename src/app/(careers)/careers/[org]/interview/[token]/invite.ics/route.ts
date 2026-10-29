import { publicInterviewIcs } from "@/lib/services/interviews";

export const dynamic = "force-dynamic";

/** The booked interview as a calendar file, for « Ajouter à mon agenda ». */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/careers/[org]/interview/[token]/invite.ics">,
) {
  const { org, token } = await params;
  const ics = await publicInterviewIcs(org, token);
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="entretien.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
