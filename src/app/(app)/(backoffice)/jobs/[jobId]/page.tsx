import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobPageTop } from "@/components/jobs/job-header";
import { PipelineView } from "@/components/pipeline/pipeline-view";
import { requireContext } from "@/lib/context";
import { appUrl } from "@/lib/env";
import { can, NotFoundError } from "@/lib/permissions";
import { getAccessibleJob, isUuid } from "@/lib/services/access";
import { listTemplates } from "@/lib/services/emails";
import { getOrganization } from "@/lib/services/organizations";
import { getBoard } from "@/lib/services/pipeline";

export async function generateMetadata({ params }: PageProps<"/jobs/[jobId]">): Promise<Metadata> {
  const { jobId } = await params;
  if (!isUuid(jobId)) return {};
  const ctx = await requireContext();
  const job = await getAccessibleJob(ctx, jobId).catch(() => null);
  return { title: job?.title };
}

export default async function JobPipelinePage({
  params,
  searchParams,
}: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;
  if (!isUuid(jobId)) notFound();
  const ctx = await requireContext();
  const board = await getBoard(ctx, jobId).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [org, templates] = await Promise.all([getOrganization(ctx), listTemplates(ctx)]);
  const query = await searchParams;
  const requested = typeof query.a === "string" && isUuid(query.a) ? query.a : null;
  const openId = requested && board.cards.some((c) => c.id === requested) ? requested : null;
  const publicUrl = appUrl(`/careers/${org.slug}/jobs/${board.job.slug}`);
  const stages = board.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }));

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col md:h-dvh">
      <JobPageTop ctx={ctx} job={board.job} publicUrl={publicUrl} stages={stages} />
      <PipelineView
        job={{ id: board.job.id, title: board.job.title, status: board.job.status }}
        stages={stages}
        initialCards={board.cards}
        templates={templates.map((tpl) => ({
          id: tpl.id,
          name: tpl.name,
          kind: tpl.kind,
          subject: tpl.subject,
          body: tpl.body,
        }))}
        companyName={org.name}
        recruiterName={ctx.user.name}
        publicUrl={publicUrl}
        initialOpenId={openId}
        meId={ctx.userId}
        permissions={{
          move: can(ctx.role, "pipeline:move"),
          reject: can(ctx.role, "candidate:reject"),
          email: can(ctx.role, "candidate:email"),
          tag: can(ctx.role, "candidate:tag"),
          create: can(ctx.role, "candidate:create"),
          note: can(ctx.role, "candidate:note"),
          evaluate: can(ctx.role, "candidate:evaluate"),
          export: can(ctx.role, "candidate:export"),
          delete: can(ctx.role, "candidate:delete"),
        }}
      />
    </div>
  );
}
