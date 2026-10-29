import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { JobPageTop } from "@/components/jobs/job-header";
import { RulesView } from "@/components/jobs/rules-view";
import { requireContext } from "@/lib/context";
import { appUrl } from "@/lib/env";
import { can, ForbiddenError, NotFoundError } from "@/lib/permissions";
import { isUuid } from "@/lib/services/access";
import { listRules } from "@/lib/services/automations";
import { listTeamDirectory } from "@/lib/services/candidates";
import { ensureTemplate, listTemplates } from "@/lib/services/emails";
import { getJob, listStages } from "@/lib/services/jobs";
import { getOrganization } from "@/lib/services/organizations";
import { usesSchedulingVariables, usesVariable } from "@/lib/services/template-render";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rules");
  return { title: t("title") };
}

export default async function JobRulesPage({ params }: PageProps<"/jobs/[jobId]/rules">) {
  const { jobId } = await params;
  if (!isUuid(jobId)) notFound();
  const ctx = await requireContext();
  if (!can(ctx.role, "job:manage")) notFound();
  // The slot offer action needs a template with the link; the default one is created on demand.
  await ensureTemplate(ctx.orgId, "slots");
  const [job, stages, rules, templates, team, org] = await Promise.all([
    getJob(ctx, jobId),
    listStages(ctx, jobId),
    listRules(ctx, jobId),
    listTemplates(ctx),
    listTeamDirectory(ctx),
    getOrganization(ctx),
  ]).catch((error) => {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  });
  const stageList = stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }));

  return (
    <div className="flex min-h-dvh flex-col">
      <JobPageTop
        ctx={ctx}
        job={job}
        publicUrl={appUrl(`/careers/${org.slug}/jobs/${job.slug}`)}
        stages={stageList}
      />
      <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 md:py-6">
        <RulesView
          jobId={job.id}
          stages={stageList}
          rules={rules}
          questions={job.questions
            .filter((q) => q.type === "yes_no" || q.type === "single_choice")
            .map((q) => ({ id: q.id, label: q.label, type: q.type, options: q.options }))}
          templates={templates.map((tpl) => ({
            id: tpl.id,
            name: tpl.name,
            kind: tpl.kind,
            slotsLink: usesVariable(`${tpl.subject}\n${tpl.body}`, "slotsLink"),
            scheduling: usesSchedulingVariables(`${tpl.subject}\n${tpl.body}`),
          }))}
          team={team}
          meId={ctx.userId}
        />
      </div>
    </div>
  );
}
