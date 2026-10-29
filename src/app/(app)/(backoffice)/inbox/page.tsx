import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Mark } from "@/components/ui/mark";
import { requireContext } from "@/lib/context";
import { timeZone } from "@/i18n/config";
import { formatDayIn, formatRelative, formatTimeIn } from "@/lib/format";
import { noteSegments } from "@/lib/mentions";
import { listTeamDirectory } from "@/lib/services/candidates";
import { listNotifications, markNotificationsRead } from "@/lib/services/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const ctx = await requireContext();
  const t = await getTranslations("inbox");
  const locale = await getLocale();
  const [items, team] = await Promise.all([listNotifications(ctx), listTeamDirectory(ctx)]);
  const names = new Map(team.map((m) => [m.id, m.name]));
  // The list keeps showing what was unread on this visit; next time it is read.
  await markNotificationsRead(ctx);
  const now = new Date();

  return (
    <PageContainer>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mt-5 overflow-hidden rounded-md border border-line bg-paper">
        {items.length === 0 ? (
          <EmptyState
            title={t("empty")}
            description={t("emptyBody", { name: ctx.user.name.split(" ")[0] ?? "" })}
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((m) => {
              const href =
                m.applicationId && m.jobId
                  ? `/jobs/${m.jobId}?a=${m.applicationId}`
                  : `/candidates/${m.candidateId}`;
              const candidate = `${m.firstName} ${m.lastName}`;
              const linkClass =
                "text-ink after:absolute after:inset-0 after:content-[''] hover:underline";
              return (
                <li key={m.id} className="relative flex gap-3 px-4 py-3 hover:bg-stone">
                  {m.readAt === null ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 left-0 w-[3px] rounded-r-xs bg-highlighter"
                    />
                  ) : null}
                  <Avatar
                    name={m.type === "mention" ? (m.authorName ?? "?") : candidate}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-14">
                      {m.type === "mention" ? (
                        <>
                          <span className="font-medium">{m.authorName}</span>{" "}
                          <Link href={href} className={linkClass}>
                            {t("about", { candidate })}
                          </Link>
                        </>
                      ) : (
                        <Link href={href} className={`font-medium ${linkClass}`}>
                          {m.type === "reply"
                            ? t("reply", { candidate })
                            : m.type === "rule"
                              ? t("rule", { candidate })
                              : t("booked", { candidate })}
                        </Link>
                      )}
                      {m.jobTitle ? (
                        <span className="text-ink-muted"> {t("on", { job: m.jobTitle })}</span>
                      ) : null}
                      {m.readAt === null ? <span className="sr-only"> ({t("unread")})</span> : null}
                    </p>
                    {m.type === "mention" && m.noteBody ? (
                      <p className="mt-1 line-clamp-3 text-14 text-ink-muted">
                        {noteSegments(m.noteBody).map((s, i) =>
                          s.type === "text" ? (
                            <span key={i}>{s.text}</span>
                          ) : s.userId === ctx.userId ? (
                            <Mark key={i}>@{names.get(s.userId) ?? "?"}</Mark>
                          ) : (
                            <span key={i} className="font-medium text-ink">
                              @{names.get(s.userId) ?? "?"}
                            </span>
                          ),
                        )}
                      </p>
                    ) : null}
                    {m.type === "interview_booked" && m.interviewStartsAt ? (
                      <p className="mt-1 text-14 text-ink-muted tabular-nums first-letter:uppercase">
                        {formatDayIn(m.interviewStartsAt, locale, timeZone())},{" "}
                        {formatTimeIn(m.interviewStartsAt, locale, timeZone())}
                      </p>
                    ) : null}
                    {m.type === "rule" ? (
                      <p className="mt-1 line-clamp-2 text-14 text-ink-muted">
                        {m.ruleMessage || t("ruleDefault", { candidate, stage: m.stageName ?? "" })}
                      </p>
                    ) : null}
                    {m.type === "reply" && m.replyBody ? (
                      <p className="mt-1 line-clamp-2 text-14 text-ink-muted">{m.replyBody}</p>
                    ) : null}
                  </div>
                  <time className="shrink-0 text-12 text-ink-muted tabular-nums">
                    {formatRelative(m.createdAt, locale, now)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
