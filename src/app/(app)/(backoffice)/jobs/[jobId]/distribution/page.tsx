import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DistributionView } from "@/components/jobs/distribution-view";
import { JobPageTop } from "@/components/jobs/job-header";
import { requireContext } from "@/lib/context";
import { can, ForbiddenError, NotFoundError } from "@/lib/permissions";
import { isUuid } from "@/lib/services/access";
import { getJobDistribution } from "@/lib/services/distribution";
import { getJob, listStages } from "@/lib/services/jobs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("distribution");
  return { title: t("title") };
}

export default async function JobDistributionPage({
  params,
}: PageProps<"/jobs/[jobId]/distribution">) {
  const { jobId } = await params;
  if (!isUuid(jobId)) notFound();
  const ctx = await requireContext();
  if (!can(ctx.role, "job:manage")) notFound();
  const [job, distribution, stages] = await Promise.all([
    getJob(ctx, jobId),
    getJobDistribution(ctx, jobId),
    listStages(ctx, jobId),
  ]).catch((error) => {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <JobPageTop
        ctx={ctx}
        job={job}
        publicUrl={distribution.directUrl}
        stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))}
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 md:py-6">
        <DistributionView
          distribution={distribution}
          jobTitle={job.title}
          canManageChannels={can(ctx.role, "job:manage")}
        />
      </div>
    </div>
  );
}
