import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { ContractType, JobStatus, RemotePolicy, StageKind } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import type { Ctx } from "@/lib/services/types";
import { BackLink } from "./editor-page";
import { JobActions } from "./job-actions";
import { JobNav } from "./job-nav";

const statusTone = { draft: "muted", published: "success", archived: "neutral" } as const;

export async function JobHeader({
  job,
  actions,
}: {
  job: {
    title: string;
    status: JobStatus;
    department: string | null;
    location: string | null;
    contract: ContractType;
    remote: RemotePolicy;
  };
  actions?: ReactNode;
}) {
  const t = await getTranslations("jobs");
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <BackLink href={job.status === "published" ? "/jobs" : `/jobs?status=${job.status}`}>
          {t("title")}
        </BackLink>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-24 font-semibold text-ink">{job.title}</h1>
          <Badge tone={statusTone[job.status]}>{t(`status.${job.status}`)}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-13 text-ink-muted">
          {job.department ? <span>{job.department}</span> : null}
          {job.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {job.location}
            </span>
          ) : null}
          <span>{t(`contract.${job.contract}`)}</span>
          <span>{t(`remote.${job.remote}`)}</span>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * Top of every job page: title, details, actions and, for people who manage jobs, the
 * sections (candidates, distribution, rules) on the bottom line.
 */
export async function JobPageTop({
  ctx,
  job,
  publicUrl,
  stages,
}: {
  ctx: Ctx;
  job: Parameters<typeof JobHeader>[0]["job"] & { id: string };
  publicUrl: string;
  stages?: Array<{ id: string; name: string; kind: StageKind }>;
}) {
  const t = await getTranslations("jobs.nav");
  const canManage = can(ctx.role, "job:manage");
  const items = canManage
    ? [
        { href: `/jobs/${job.id}`, label: t("pipeline") },
        { href: `/jobs/${job.id}/distribution`, label: t("distribution") },
      ]
    : [];
  return (
    <div className={cn("shrink-0 border-b border-line px-4 pt-4 md:px-6", !canManage && "pb-4")}>
      <JobHeader
        job={job}
        actions={
          <JobActions
            job={{ id: job.id, title: job.title, status: job.status }}
            publicUrl={publicUrl}
            canManage={canManage}
            stages={can(ctx.role, "pipeline:edit-stages") ? stages : undefined}
          />
        }
      />
      {items.length > 0 ? (
        <div className="mt-2">
          <JobNav items={items} label={t("label")} />
        </div>
      ) : null}
    </div>
  );
}
