import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobActions } from "@/components/jobs/job-actions";
import { JobHeader } from "@/components/jobs/job-header";
import { requireContext } from "@/lib/context";
import { appUrl } from "@/lib/env";
import { can, NotFoundError } from "@/lib/permissions";
import { getAccessibleJob, isUuid } from "@/lib/services/access";
import { getOrganization } from "@/lib/services/organizations";

export async function generateMetadata({ params }: PageProps<"/jobs/[jobId]">): Promise<Metadata> {
  const { jobId } = await params;
  if (!isUuid(jobId)) return {};
  const ctx = await requireContext();
  const job = await getAccessibleJob(ctx, jobId).catch(() => null);
  return { title: job?.title };
}

export default async function JobPipelinePage({ params }: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;
  if (!isUuid(jobId)) notFound();
  const ctx = await requireContext();
  const job = await getAccessibleJob(ctx, jobId).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const org = await getOrganization(ctx);
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="border-b border-line px-4 py-4 md:px-6">
        <JobHeader
          job={job}
          actions={
            <JobActions
              job={{ id: job.id, title: job.title, status: job.status }}
              publicUrl={appUrl(`/careers/${org.slug}/jobs/${job.slug}`)}
              canManage={can(ctx.role, "job:manage")}
            />
          }
        />
      </div>
    </div>
  );
}
