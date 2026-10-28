import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { BackLink } from "@/components/jobs/editor-page";
import { JobEditor } from "@/components/jobs/job-editor";
import { requireContext } from "@/lib/context";
import { can, NotFoundError } from "@/lib/permissions";
import { isUuid } from "@/lib/services/access";
import { getJob, jobSuggestions } from "@/lib/services/jobs";
import { listMembers } from "@/lib/services/team";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("jobs.editor");
  return { title: t("editTitle") };
}

export default async function EditJobPage({ params }: PageProps<"/jobs/[jobId]/edit">) {
  const { jobId } = await params;
  if (!isUuid(jobId)) notFound();
  const ctx = await requireContext();
  if (!can(ctx.role, "job:manage")) redirect(`/jobs/${jobId}`);
  const t = await getTranslations("jobs");
  const job = await getJob(ctx, jobId).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [members, suggestions] = await Promise.all([listMembers(ctx), jobSuggestions(ctx)]);
  return (
    <PageContainer>
      <PageHeader before={<BackLink href={`/jobs/${job.id}`}>{job.title}</BackLink>} title={t("editor.editTitle")} className="mb-5" />
      <JobEditor
        jobId={job.id}
        status={job.status}
        members={members}
        suggestions={suggestions}
        initial={{
          title: job.title,
          descriptionHtml: job.descriptionHtml,
          department: job.department ?? "",
          location: job.location ?? "",
          remote: job.remote,
          contract: job.contract,
          salaryMin: job.salaryMin?.toString() ?? "",
          salaryMax: job.salaryMax?.toString() ?? "",
          salaryCurrency: job.salaryCurrency,
          salaryPeriod: job.salaryPeriod,
          questions: job.questions.map((q) => ({ id: q.id, label: q.label, type: q.type, options: q.options, required: q.required })),
          memberIds: job.memberIds,
        }}
      />
    </PageContainer>
  );
}
