"use client";

import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveStagesAction } from "@/app/(app)/(backoffice)/jobs/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import type { StageKind } from "@/lib/db/schema";

type Draft = { key: string; id?: string; name: string; kind: StageKind };
let seed = 0;

export function StageEditor({
  jobId,
  stages,
  open,
  onOpenChange,
}: {
  jobId: string;
  stages: Array<{ id: string; name: string; kind: StageKind }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("pipeline.stages");
  const tx = loose(useTranslations());
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(() => stages.map((s) => ({ key: s.id, ...s })));
  const [pending, start] = useTransition();

  const actives = drafts.filter((d) => d.kind === "active");
  const update = (key: string, name: string) => setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, name } : d)));
  const move = (key: string, delta: number) =>
    setDrafts((prev) => {
      const list = [...prev];
      const i = list.findIndex((d) => d.key === key);
      const j = i + delta;
      if (j < 0 || j >= list.length || list[j]!.kind !== "active") return prev;
      [list[i], list[j]] = [list[j]!, list[i]!];
      return list;
    });
  const add = () =>
    setDrafts((prev) => {
      const hiredIndex = prev.findIndex((d) => d.kind === "hired");
      const list = [...prev];
      list.splice(hiredIndex < 0 ? list.length : hiredIndex, 0, { key: `new-${++seed}`, name: t("newStage"), kind: "active" });
      return list;
    });

  const save = () =>
    start(async () => {
      const result = await saveStagesAction(jobId, drafts.map((d) => ({ id: d.id, name: d.name })));
      if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
      toast(t("saved"));
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("title")} description={t("description")} closeLabel={tx("common.close")}>
        <DialogBody className="flex flex-col gap-3">
          <ol className="flex flex-col gap-2">
            {drafts.map((d) => {
              const fixed = d.kind !== "active";
              const activeIndex = actives.findIndex((a) => a.key === d.key);
              return (
                <li key={d.key} className="flex items-center gap-1.5">
                  <Input aria-label={t("name")} value={d.name} maxLength={60} onChange={(e) => update(d.key, e.target.value)} />
                  {fixed ? (
                    <span className="inline-flex w-[100px] shrink-0 items-center justify-center gap-1 text-12 text-ink-muted" title={t("fixed")}>
                      <Lock className="size-3.5" aria-hidden="true" />
                      {t("fixed")}
                    </span>
                  ) : (
                    <span className="flex w-[100px] shrink-0 justify-end">
                      <IconButton label={t("moveUp")} disabled={activeIndex === 0} onClick={() => move(d.key, -1)}>
                        <ArrowUp />
                      </IconButton>
                      <IconButton label={t("moveDown")} disabled={activeIndex === actives.length - 1} onClick={() => move(d.key, 1)}>
                        <ArrowDown />
                      </IconButton>
                      <IconButton label={t("remove")} onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}>
                        <Trash2 />
                      </IconButton>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <Button className="self-start" onClick={add}>
            <Plus aria-hidden="true" />
            {t("add")}
          </Button>
          <p className="text-13 text-ink-muted">{t("removeHint")}</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{tx("common.cancel")}</Button>
          </DialogClose>
          <Button variant="primary" loading={pending} onClick={save}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
