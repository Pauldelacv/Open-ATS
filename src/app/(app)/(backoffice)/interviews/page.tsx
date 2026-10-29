import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { JobNav } from "@/components/jobs/job-nav";
import { EmptyState } from "@/components/ui/empty-state";
import { requireContext } from "@/lib/context";
import { formatDayIn, formatRelative, formatTimeIn } from "@/lib/format";
import { listInterviewsOverview } from "@/lib/services/interviews";
import { addDays, zonedDate } from "@/lib/time/zoned";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("interviews.page");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-line bg-paper" aria-label={title}>
      <h2 className="border-b border-line px-4 py-2.5 text-13 font-medium text-ink-muted">
        {title} <span className="tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

export default async function InterviewsPage({ searchParams }: PageProps<"/interviews">) {
  const ctx = await requireContext();
  const t = await getTranslations("interviews.page");
  const tl = await getTranslations("interviews.locationLine");
  const locale = await getLocale();
  const scope = (await searchParams).scope === "team" && ctx.role !== "member" ? "team" : "mine";
  const { upcoming, pending, toEvaluate, timeZone } = await listInterviewsOverview(ctx, scope);
  const today = zonedDate(new Date(), timeZone);
  const tomorrow = addDays(today, 1);
  const days = new Map<string, typeof upcoming>();
  for (const interview of upcoming) {
    const day = zonedDate(interview.startsAt, timeZone);
    days.set(day, [...(days.get(day) ?? []), interview]);
  }
  const where = (i: (typeof upcoming)[number]) =>
    i.locationKind === "video"
      ? i.location
        ? tl("video", { location: i.location })
        : tl("videoNoLink")
      : i.locationKind === "onsite"
        ? i.location
          ? tl("onsite", { location: i.location })
          : tl("onsiteNoAddress")
        : i.location
          ? tl("phone", { location: i.location })
          : tl("phoneNoNumber");
  const href = (i: { jobId: string; applicationId: string }) =>
    `/jobs/${i.jobId}?a=${i.applicationId}`;
  const empty = upcoming.length === 0 && pending.length === 0 && toEvaluate.length === 0;

  return (
    <PageContainer>
      <PageHeader title={t("title")} description={t("description")} />
      {ctx.role !== "member" ? (
        <div className="mt-4 border-b border-line">
          <JobNav
            label={t("scope")}
            items={[
              { href: "/interviews", label: t("mine") },
              { href: "/interviews?scope=team", label: t("team") },
            ]}
            active={scope === "mine" ? 0 : 1}
          />
        </div>
      ) : null}
      <div className="mt-5 flex flex-col gap-5">
        {empty ? (
          <div className="rounded-md border border-line bg-paper">
            <EmptyState title={t("empty")} description={t("emptyBody")} />
          </div>
        ) : null}
        {upcoming.length > 0 ? (
          <Section title={t("upcoming")} count={upcoming.length}>
            {[...days.entries()].map(([day, list]) => (
              <div key={day} className="border-b border-line last:border-b-0">
                <h3 className="bg-stone px-4 py-1.5 text-13 font-medium text-ink first-letter:uppercase">
                  {day === today
                    ? t("today")
                    : day === tomorrow
                      ? t("tomorrow")
                      : formatDayIn(list[0]!.startsAt, locale, timeZone)}
                </h3>
                <ul className="divide-y divide-line">
                  {list.map((i) => (
                    <li
                      key={i.id}
                      className="relative grid gap-x-4 gap-y-0.5 px-4 py-2.5 hover:bg-stone sm:grid-cols-[120px_minmax(0,1fr)]"
                    >
                      <span className="text-14 font-medium tabular-nums">
                        {formatTimeIn(i.startsAt, locale, timeZone)} –{" "}
                        {formatTimeIn(i.endsAt, locale, timeZone)}
                      </span>
                      <span className="min-w-0">
                        <Link
                          href={href(i)}
                          className="text-14 font-medium text-ink after:absolute after:inset-0 hover:underline"
                        >
                          {i.firstName} {i.lastName}
                        </Link>
                        <span className="text-14 text-ink-muted"> {i.jobTitle}</span>
                        <span className="block truncate text-13 text-ink-muted">
                          {where(i)}, {i.attendees.map((a) => a.name).join(", ")}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Section>
        ) : null}
        {pending.length > 0 ? (
          <Section title={t("pending")} count={pending.length}>
            <ul className="divide-y divide-line">
              {pending.map((p) => (
                <li key={p.id} className="relative px-4 py-2.5 hover:bg-stone">
                  <Link
                    href={href(p)}
                    className="text-14 font-medium text-ink after:absolute after:inset-0 hover:underline"
                  >
                    {p.firstName} {p.lastName}
                  </Link>
                  <span className="text-14 text-ink-muted"> {p.jobTitle}</span>
                  <span className="block text-13 text-ink-muted">
                    {t("pendingRow", {
                      date: formatRelative(p.createdAt, locale),
                      until: formatDayIn(p.expiresAt, locale, timeZone),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        {toEvaluate.length > 0 ? (
          <Section title={t("toEvaluate")} count={toEvaluate.length}>
            <ul className="divide-y divide-line">
              {toEvaluate.map((i) => (
                <li
                  key={i.id}
                  className="relative flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5 hover:bg-stone"
                >
                  <span className="min-w-0">
                    <Link
                      href={href(i)}
                      className="text-14 font-medium text-ink after:absolute after:inset-0 hover:underline"
                    >
                      {i.firstName} {i.lastName}
                    </Link>
                    <span className="text-14 text-ink-muted"> {i.jobTitle}</span>
                  </span>
                  <span className="text-13 text-ink-muted tabular-nums first-letter:uppercase">
                    {formatDayIn(i.startsAt, locale, timeZone)},{" "}
                    {formatTimeIn(i.startsAt, locale, timeZone)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </PageContainer>
  );
}
