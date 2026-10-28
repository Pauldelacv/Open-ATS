import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CandidatePageView } from "@/components/candidates/candidate-page-view";
import { BackLink } from "@/components/jobs/editor-page";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { requireContext } from "@/lib/context";
import { can, NotFoundError } from "@/lib/permissions";
import { isUuid } from "@/lib/services/access";
import { assertCandidateAccess, listCandidateApplications } from "@/lib/services/candidates";
import { listTemplates } from "@/lib/services/emails";
import { listStages } from "@/lib/services/jobs";
import { getOrganization } from "@/lib/services/organizations";

export async function generateMetadata({ params }: PageProps<"/candidates/[candidateId]">): Promise<Metadata> {
  const { candidateId } = await params;
  if (!isUuid(candidateId)) return {};
  const ctx = await requireContext();
  const candidate = await assertCandidateAccess(ctx, candidateId).catch(() => null);
  return { title: candidate ? `${candidate.firstName} ${candidate.lastName}` : undefined };
}

export default async function CandidatePage({ params, searchParams }: PageProps<"/candidates/[candidateId]">) {
  const { candidateId } = await params;
  if (!isUuid(candidateId)) notFound();
  const ctx = await requireContext();
  const candidate = await assertCandidateAccess(ctx, candidateId).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const t = await getTranslations("candidate");
  const apps = await listCandidateApplications(ctx, candidateId);
  if (apps.length === 0) notFound();
  const query = await searchParams;
  const selected = apps.find((a) => a.id === query.a) ?? apps[0]!;
  const [stages, templates, org] = await Promise.all([listStages(ctx, selected.jobId), listTemplates(ctx), getOrganization(ctx)]);

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col px-4 py-4 md:h-dvh md:px-6">
      <div className="shrink-0">
        <BackLink href="/candidates">{t("back")}</BackLink>
      </div>
      {apps.length > 1 ? (
        <nav aria-label={t("choose")} className="mt-2 mb-3 flex shrink-0 gap-2 overflow-x-auto">
          {apps.map((a) => (
            <Link
              key={a.id}
              href={`/candidates/${candidateId}?a=${a.id}`}
              aria-current={a.id === selected.id ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-sm border px-2.5 py-1.5 text-13",
                a.id === selected.id ? "border-cobalt bg-cobalt-tint" : "border-line bg-paper hover:border-line-strong",
              )}
            >
              <span className="font-medium">{a.jobTitle}</span>
              <Badge tone={a.stageKind === "rejected" ? "danger" : a.stageKind === "hired" ? "success" : "neutral"}>{a.stageName}</Badge>
            </Link>
          ))}
        </nav>
      ) : (
        <div className="h-2 shrink-0" />
      )}
      <div className="min-h-0 flex-1">
        <CandidatePageView
          applicationId={selected.id}
          stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))}
          recipient={{ applicationId: selected.id, firstName: candidate.firstName, lastName: candidate.lastName, jobTitle: selected.jobTitle, email: candidate.email }}
          templates={templates.map((tpl) => ({ id: tpl.id, name: tpl.name, kind: tpl.kind, subject: tpl.subject, body: tpl.body }))}
          companyName={org.name}
          recruiterName={ctx.user.name}
          meId={ctx.userId}
          permissions={{
            move: can(ctx.role, "pipeline:move"),
            reject: can(ctx.role, "candidate:reject"),
            email: can(ctx.role, "candidate:email"),
            tag: can(ctx.role, "candidate:tag"),
            note: can(ctx.role, "candidate:note"),
            evaluate: can(ctx.role, "candidate:evaluate"),
            export: can(ctx.role, "candidate:export"),
            delete: can(ctx.role, "candidate:delete"),
          }}
        />
      </div>
    </div>
  );
}
