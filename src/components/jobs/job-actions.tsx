"use client";

import { Archive, Copy, ExternalLink, FilePen, Layers, Link2, MoreHorizontal, RotateCcw, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { deleteJobAction, duplicateJobAction, setJobStatusAction } from "@/app/(app)/(backoffice)/jobs/actions";
import { loose } from "@/i18n/loose";
import type { JobStatus } from "@/lib/db/schema";

export function JobActions({
  job,
  publicUrl,
  canManage,
  onEditStages,
}: {
  job: { id: string; title: string; status: JobStatus };
  publicUrl: string;
  canManage: boolean;
  onEditStages?: () => void;
}) {
  const t = useTranslations("jobs");
  const tc = useTranslations("common");
  const tx = loose(useTranslations());
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<"delete" | "archive" | null>(null);

  const changeStatus = (status: JobStatus, message: string) =>
    start(async () => {
      const result = await setJobStatusAction(job.id, status);
      if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
      toast(message);
      setConfirm(null);
      router.refresh();
    });

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast(tc("copied"));
  };

  if (!canManage) {
    return job.status === "published" ? (
      <Button asChild>
        <a href={publicUrl} target="_blank" rel="noopener">
          <ExternalLink aria-hidden="true" />
          {t("actions.viewOnSite")}
        </a>
      </Button>
    ) : null;
  }

  return (
    <>
      {job.status === "draft" ? (
        <Button variant="primary" loading={pending} onClick={() => changeStatus("published", t("toasts.published"))}>
          {t("actions.publish")}
        </Button>
      ) : null}
      {job.status === "archived" ? (
        <Button loading={pending} onClick={() => changeStatus("published", t("toasts.restored"))}>
          <RotateCcw aria-hidden="true" />
          {t("actions.restore")}
        </Button>
      ) : null}
      {job.status === "published" ? (
        <Button asChild>
          <a href={publicUrl} target="_blank" rel="noopener">
            <ExternalLink aria-hidden="true" />
            {t("actions.viewOnSite")}
          </a>
        </Button>
      ) : null}
      <Button asChild>
        <Link href={`/jobs/${job.id}/edit`}>
          <FilePen aria-hidden="true" />
          {t("actions.edit")}
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={tc("more")} className="w-8 px-0">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {onEditStages ? (
            <DropdownMenuItem onSelect={onEditStages}>
              <Layers aria-hidden="true" />
              {t("actions.stages")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() =>
              start(async () => {
                const result = await duplicateJobAction(job.id);
                if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
                toast(t("toasts.duplicated"));
                router.push(`/jobs/${result.data.id}/edit`);
              })
            }
          >
            <Copy aria-hidden="true" />
            {t("actions.duplicate")}
          </DropdownMenuItem>
          {job.status === "published" ? (
            <DropdownMenuItem onSelect={copyLink}>
              <Link2 aria-hidden="true" />
              {t("actions.copyLink")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {job.status === "published" ? (
            <DropdownMenuItem onSelect={() => changeStatus("draft", t("toasts.unpublished"))}>
              <Undo2 aria-hidden="true" />
              {t("actions.unpublish")}
            </DropdownMenuItem>
          ) : null}
          {job.status !== "archived" ? (
            <DropdownMenuItem onSelect={() => setConfirm("archive")}>
              <Archive aria-hidden="true" />
              {t("actions.archive")}
            </DropdownMenuItem>
          ) : null}
          {job.status === "draft" ? (
            <DropdownMenuItem tone="danger" onSelect={() => setConfirm("delete")}>
              <Trash2 aria-hidden="true" />
              {t("actions.delete")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        {confirm ? (
          <DialogContent
            width="sm"
            closeLabel={tc("close")}
            title={confirm === "delete" ? t("actions.deleteConfirmTitle") : t("actions.archiveConfirmTitle")}
          >
            <DialogBody>
              <p className="text-14">
                {confirm === "delete" ? t("actions.deleteConfirmBody", { title: job.title }) : t("actions.archiveConfirmBody")}
              </p>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{tc("cancel")}</Button>
              </DialogClose>
              {confirm === "delete" ? (
                <Button
                  variant="danger"
                  loading={pending}
                  onClick={() =>
                    start(async () => {
                      const result = await deleteJobAction(job.id);
                      if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
                      toast(t("toasts.deleted"));
                      router.push("/jobs?status=draft");
                    })
                  }
                >
                  {t("actions.delete")}
                </Button>
              ) : (
                <Button variant="primary" loading={pending} onClick={() => changeStatus("archived", t("toasts.archived"))}>
                  {t("actions.archive")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
