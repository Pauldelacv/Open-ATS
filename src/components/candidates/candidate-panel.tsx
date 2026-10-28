"use client";

import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Keyboard,
  Mail,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  addTagAction,
  moveApplicationsAction,
  removeTagAction,
  saveEvaluationAction,
} from "@/app/(app)/(backoffice)/jobs/[jobId]/actions";
import { deleteCandidateAction } from "@/app/(app)/(backoffice)/candidates/actions";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Select } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { cn } from "@/lib/cn";
import type { StageKind } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import type { ApplicationDetail } from "@/lib/services/candidates";
import { CvViewer } from "./cv-viewer";
import type { TemplateOption } from "./email-fields";
import {
  ActivitySection,
  ApplicationSection,
  EvaluationsSection,
  NotesSection,
} from "./panel-sections";
import { ShortcutsDialog } from "./shortcuts-dialog";

type Tab = "application" | "notes" | "evaluations" | "activity";
let rememberedTab: Tab = "application";

type Permissions = {
  move: boolean;
  reject: boolean;
  email: boolean;
  tag: boolean;
  note?: boolean;
  evaluate?: boolean;
  export?: boolean;
  delete?: boolean;
};

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function CandidatePanel({
  applicationId,
  orderedIds,
  stages,
  onNavigate,
  onClose,
  onChanged,
  onMoved,
  onViewed,
  onReject,
  onEmail,
  permissions,
  meId,
  mode = "panel",
  onDeleted,
}: {
  onDeleted?: (candidateId: string) => void;
  applicationId: string;
  orderedIds: string[];
  stages: Array<{ id: string; name: string; kind: StageKind }>;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onChanged?: () => void;
  onMoved?: (id: string, stageId: string) => void;
  onViewed?: (id: string) => void;
  onReject: (id: string) => void;
  onEmail: (id: string) => void;
  templates?: TemplateOption[];
  companyName?: string;
  recruiterName?: string;
  permissions: Permissions;
  meId: string;
  mode?: "panel" | "page";
}) {
  const t = useTranslations("panel");
  const tg = useTranslations("gdpr");
  const tReject = useTranslations("reject");
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [deleting, startDelete] = useTransition();
  const tx = loose(useTranslations());
  const locale = useLocale();
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>(rememberedTab);
  const [view, setView] = useState<"details" | "cv">("details");
  const [help, setHelp] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagName, setTagName] = useState("");
  const [pendingRating, setPendingRating] = useState<number | null>(null);
  const [, start] = useTransition();
  const panelRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/applications/${applicationId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setDetail((await res.json()) as ApplicationDetail);
      setError(false);
    } catch {
      setError(true);
    }
  }, [applicationId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${applicationId}`, { cache: "no-store" })
      .then((res) =>
        res.ok
          ? (res.json() as Promise<ApplicationDetail>)
          : Promise.reject(new Error(String(res.status))),
      )
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setError(false);
        onViewed?.(applicationId);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const index = orderedIds.indexOf(applicationId);
  const prevId = index > 0 ? orderedIds[index - 1] : undefined;
  const nextId = index >= 0 && index < orderedIds.length - 1 ? orderedIds[index + 1] : undefined;
  const isRejected = detail?.application.stageKind === "rejected";

  const changeTab = (value: string) => {
    rememberedTab = value as Tab;
    setTab(value as Tab);
  };

  const moveTo = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || !detail) return;
    if (stage.kind === "rejected") return onReject(applicationId);
    start(async () => {
      const result = await moveApplicationsAction([applicationId], stageId, 0);
      if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
      onMoved?.(applicationId, stageId);
      toast(t("moved", { stage: stage.name }));
      await load();
      onChanged?.();
    });
  };

  const rate = useCallback(
    (value: number) => {
      if (!detail || !permissions.evaluate) return;
      setPendingRating(value);
      start(async () => {
        const result = await saveEvaluationAction({
          applicationId,
          rating: value,
          comment: detail.evaluations.mine?.comment ?? "",
        });
        if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
        toast(t("rated", { value }));
        await load();
        setPendingRating(null);
      });
    },
    [applicationId, detail, load, permissions.evaluate, t, tx],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const key = event.key;
      if (key === "Escape") {
        if (mode === "panel") onClose();
      } else if (key === "j" || key === "J") {
        if (nextId) onNavigate(nextId);
      } else if (key === "k" || key === "K") {
        if (prevId) onNavigate(prevId);
      } else if (/^[1-5]$/.test(key)) {
        rate(Number(key));
      } else if (key === "e" || key === "E") {
        if (permissions.email && detail?.candidate.email) onEmail(applicationId);
      } else if (key === "r" || key === "R") {
        if (permissions.reject && !isRejected) onReject(applicationId);
      } else if (key === "?") {
        setHelp(true);
      } else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    applicationId,
    detail,
    isRejected,
    mode,
    nextId,
    onClose,
    onEmail,
    onNavigate,
    onReject,
    permissions,
    prevId,
    rate,
  ]);

  const addTag = () =>
    start(async () => {
      if (!detail || !tagName.trim()) return;
      const result = await addTagAction([detail.candidate.id], tagName.trim());
      if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
      setTagName("");
      setTagOpen(false);
      await load();
      onChanged?.();
    });

  const name = detail ? `${detail.candidate.firstName} ${detail.candidate.lastName}` : "";

  return (
    <aside
      ref={panelRef}
      aria-label={t("label")}
      className={cn(
        "flex min-h-0 flex-col bg-paper",
        mode === "panel" &&
          "fixed inset-0 z-40 animate-panel-in md:left-14 xl:static xl:inset-auto xl:z-auto xl:w-[min(1040px,calc(100%-300px))] xl:shrink-0 xl:border-l xl:border-line",
        mode === "page" && "h-full rounded-md border border-line",
      )}
    >
      <header className="shrink-0 border-b border-line px-4 pt-3 pb-3 md:px-5">
        <div className="flex items-center gap-1">
          {mode === "panel" ? (
            <>
              <IconButton
                label={t("close")}
                hint={<Kbd className="h-4 border-paper/30 bg-transparent text-paper">Esc</Kbd>}
                onClick={onClose}
              >
                <X />
              </IconButton>
              <IconButton
                label={t("previous")}
                hint="K"
                disabled={!prevId}
                onClick={() => prevId && onNavigate(prevId)}
              >
                <ChevronUp />
              </IconButton>
              <IconButton
                label={t("next")}
                hint="J"
                disabled={!nextId}
                onClick={() => nextId && onNavigate(nextId)}
              >
                <ChevronDown />
              </IconButton>
              {index >= 0 ? (
                <span className="ml-1 text-12 text-ink-muted tabular-nums">
                  {t("position", { index: index + 1, total: orderedIds.length })}
                </span>
              ) : null}
            </>
          ) : null}
          <span className="flex-1" />
          <IconButton label={t("shortcuts.open")} hint="?" onClick={() => setHelp(true)}>
            <Keyboard />
          </IconButton>
        </div>

        {detail ? (
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-20 font-semibold">{name}</h2>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-13 text-ink-muted">
                {detail.candidate.email ? (
                  <a
                    href={`mailto:${detail.candidate.email}`}
                    className="hover:text-ink hover:underline"
                  >
                    {detail.candidate.email}
                  </a>
                ) : (
                  <span>{t("noEmail")}</span>
                )}
                <Link href={`/jobs/${detail.job.id}`} className="hover:text-ink hover:underline">
                  {detail.job.title}
                </Link>
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`stage-${applicationId}`}>
                {t("stage")}
              </label>
              <Select
                id={`stage-${applicationId}`}
                value={detail.application.stageId}
                disabled={!permissions.move}
                onChange={(e) => moveTo(e.target.value)}
                className="w-44"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {permissions.email ? (
                <Button
                  onClick={() => onEmail(applicationId)}
                  disabled={!detail.candidate.email}
                  title="E"
                >
                  <Mail aria-hidden="true" />
                  {t("email")}
                </Button>
              ) : null}
              {permissions.reject && !isRejected ? (
                <Button onClick={() => onReject(applicationId)} title="R">
                  {t("reject")}
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label={t("more")} className="w-8 px-0">
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {mode === "panel" ? (
                    <DropdownMenuItem asChild>
                      <Link href={`/candidates/${detail.candidate.id}?a=${applicationId}`}>
                        <ExternalLink aria-hidden="true" />
                        {t("openProfile")}
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {permissions.export ? (
                    <DropdownMenuItem asChild>
                      <a href={`/api/candidates/${detail.candidate.id}/export`} download>
                        <Download aria-hidden="true" />
                        {tg("export")}
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  {permissions.delete ? (
                    <DropdownMenuItem tone="danger" onSelect={() => setDeleteOpen(true)}>
                      <Trash2 aria-hidden="true" />
                      {tg("delete")}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ) : error ? null : (
          <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3.5 w-72" />
          </div>
        )}

        {detail ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {detail.tags.map((tag) => (
              <Tag
                key={tag.id}
                onRemove={
                  permissions.tag
                    ? () =>
                        start(async () => {
                          await removeTagAction(detail.candidate.id, tag.id);
                          await load();
                          onChanged?.();
                        })
                    : undefined
                }
                removeLabel={t("removeTag", { name: tag.name })}
              >
                {tag.name}
              </Tag>
            ))}
            {permissions.tag ? (
              <Popover open={tagOpen} onOpenChange={setTagOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-12 text-ink-muted hover:bg-stone hover:text-ink"
                  >
                    <Plus className="size-3" aria-hidden="true" />
                    {t("addTag")}
                  </button>
                </PopoverTrigger>
                <PopoverContent>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addTag();
                    }}
                  >
                    <Input
                      autoFocus
                      value={tagName}
                      onChange={(e) => setTagName(e.target.value)}
                      placeholder={t("tagPlaceholder")}
                      aria-label={t("addTag")}
                      maxLength={40}
                    />
                    <Button type="submit" variant="primary">
                      {tx("pipeline.apply")}
                    </Button>
                  </form>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        ) : null}

        {detail && isRejected && detail.application.rejectedAt ? (
          <Banner
            tone="danger"
            className="mt-3"
            title={t("rejectedBanner", { date: formatDate(detail.application.rejectedAt, locale) })}
          >
            {detail.application.rejectionReason
              ? `${t("rejectedReason", { reason: tReject(`reasons.${detail.application.rejectionReason}` as "reasons.other") })}. `
              : ""}
            {permissions.move ? t("rejectedHint") : null}
          </Banner>
        ) : null}

        <div
          className="mt-3 flex gap-1 rounded-sm bg-stone p-0.5 xl:hidden"
          role="tablist"
          aria-label={t("label")}
        >
          {(["details", "cv"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-7 flex-1 rounded-xs text-13 font-medium",
                view === v
                  ? "bg-paper text-ink shadow-[0_0_0_1px_var(--color-line)]"
                  : "text-ink-muted",
              )}
            >
              {v === "cv" ? t("showCv") : t("showDetails")}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="p-6">
          <Banner
            tone="danger"
            title={t("loadError")}
            action={
              <Button size="sm" onClick={() => void load()}>
                {t("retry")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <CvViewer
            key={detail?.candidate.id ?? "loading"}
            files={detail ? detail.cvs.map((f) => ({ ...f, createdAt: String(f.createdAt) })) : []}
            className={cn(
              "min-h-0 border-line xl:border-r",
              view === "cv" ? "flex" : "hidden xl:flex",
              !detail && "invisible",
            )}
          />
          <div
            className={cn(
              "min-h-0 overflow-y-auto px-4 py-4 md:px-5",
              view === "details" ? "block" : "hidden xl:block",
            )}
          >
            {detail ? (
              <Tabs value={tab} onValueChange={changeTab}>
                <TabsList>
                  <TabsTrigger value="application">{t("tabs.application")}</TabsTrigger>
                  <TabsTrigger value="notes">
                    {t("tabs.notes")}
                    {detail.notes.length > 0 ? (
                      <span className="font-normal text-ink-muted tabular-nums">
                        {detail.notes.length}
                      </span>
                    ) : null}
                  </TabsTrigger>
                  <TabsTrigger value="evaluations">{t("tabs.evaluations")}</TabsTrigger>
                  <TabsTrigger value="activity">{t("tabs.activity")}</TabsTrigger>
                </TabsList>
                <TabsContent value="application" className="pt-4">
                  <ApplicationSection detail={detail} />
                </TabsContent>
                <TabsContent value="notes" className="pt-4">
                  <NotesSection
                    detail={detail}
                    meId={meId}
                    canNote={permissions.note ?? true}
                    onChanged={() => void load()}
                  />
                </TabsContent>
                <TabsContent value="evaluations" className="pt-4">
                  <EvaluationsSection
                    key={`${detail.evaluations.mine?.rating ?? "none"}-${pendingRating ?? ""}`}
                    detail={detail}
                    canEvaluate={permissions.evaluate ?? true}
                    pendingRating={pendingRating}
                    onChanged={() => {
                      void load();
                      onChanged?.();
                    }}
                  />
                </TabsContent>
                <TabsContent value="activity" className="pt-4">
                  <ActivitySection detail={detail} />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col gap-3" aria-hidden="true">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}
          </div>
        </div>
      )}
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
      {detail && permissions.delete ? (
        <Dialog
          open={deleteOpen}
          onOpenChange={(open) => {
            setDeleteOpen(open);
            setConfirmWord("");
          }}
        >
          <DialogContent
            width="sm"
            title={tg("deleteTitle", { name })}
            closeLabel={tx("common.close")}
          >
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault();
                if (confirmWord.trim().toUpperCase() !== tg("deleteWord")) return;
                startDelete(async () => {
                  const result = await deleteCandidateAction(detail.candidate.id);
                  if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
                  toast(tg("deleted"));
                  setDeleteOpen(false);
                  if (onDeleted) onDeleted(detail.candidate.id);
                  else router.push("/candidates");
                });
              }}
            >
              <DialogBody className="flex flex-col gap-4">
                <p className="text-14">{tg("deleteBody")}</p>
                <Field label={tg("deleteConfirmLabel")}>
                  <Input
                    value={confirmWord}
                    onChange={(e) => setConfirmWord(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{tx("common.cancel")}</Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant="danger"
                  loading={deleting}
                  disabled={confirmWord.trim().toUpperCase() !== tg("deleteWord")}
                >
                  {tg("delete")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </aside>
  );
}
