import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageContainer, PageHeader } from "@/components/app/page-header";
import { BackLink } from "@/components/jobs/editor-page";
import { JobEditor } from "@/components/jobs/job-editor";
import { requireContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { jobSuggestions } from "@/lib/services/jobs";
import { listMembers } from "@/lib/services/team";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("jobs.editor");
  return { title: t("newTitle") };
}

export default async function NewJobPage() {
  const ctx = await requireContext();
  if (!can(ctx.role, "job:manage")) redirect("/jobs");
  const t = await getTranslations("jobs");
  const [members, suggestions] = await Promise.all([listMembers(ctx), jobSuggestions(ctx)]);
  return (
    <PageContainer>
      <PageHeader before={<BackLink href="/jobs">{t("title")}</BackLink>} title={t("editor.newTitle")} className="mb-5" />
      <JobEditor
        jobId={null}
        status={null}
        members={members}
        suggestions={suggestions}
        initial={{
          title: "",
          descriptionHtml: "",
          department: "",
          location: "",
          remote: "onsite",
          contract: "cdi",
          salaryMin: "",
          salaryMax: "",
          salaryCurrency: "EUR",
          salaryPeriod: "year",
          questions: [],
          memberIds: [ctx.userId],
        }}
      />
    </PageContainer>
  );
}
