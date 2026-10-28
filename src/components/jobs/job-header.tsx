import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { ContractType, JobStatus, RemotePolicy } from "@/lib/db/schema";
import { BackLink } from "./editor-page";

const statusTone = { draft: "muted", published: "success", archived: "neutral" } as const;

export async function JobHeader({
  job,
  actions,
}: {
  job: { title: string; status: JobStatus; department: string | null; location: string | null; contract: ContractType; remote: RemotePolicy };
  actions?: ReactNode;
}) {
  const t = await getTranslations("jobs");
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <BackLink href={job.status === "published" ? "/jobs" : `/jobs?status=${job.status}`}>{t("title")}</BackLink>
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
