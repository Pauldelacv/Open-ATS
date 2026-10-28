"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Search, Tag as TagIcon, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addTagAction, moveApplicationsAction, undoMoveAction } from "@/app/(app)/(backoffice)/jobs/[jobId]/actions";
import { EmailComposer } from "@/components/candidates/email-composer";
import type { Recipient, TemplateOption } from "@/components/candidates/email-fields";
import { RejectDialog } from "@/components/candidates/reject-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { cn } from "@/lib/cn";
import type { JobStatus, StageKind } from "@/lib/db/schema";
import type { BoardCard } from "@/lib/services/pipeline";
import { fold } from "@/lib/utils/text";
import { CardBody, KanbanCard } from "./kanban-card";
import { KanbanColumn } from "./kanban-column";
import { ManualCandidateDialog } from "./manual-candidate";

export type StageInfo = { id: string; name: string; kind: StageKind };

type Columns = Record<string, string[]>;

function buildColumns(stages: StageInfo[], cards: BoardCard[]): Columns {
  const columns: Columns = Object.fromEntries(stages.map((s) => [s.id, [] as string[]]));
  for (const card of [...cards].sort((a, b) => a.position - b.position)) columns[card.stageId]?.push(card.id);
  return columns;
}

export function PipelineView({
  job,
  stages,
  initialCards,
  templates,
  companyName,
  recruiterName,
  publicUrl,
  permissions,
  initialOpenId,
  meId,
}: {
  job: { id: string; title: string; status: JobStatus };
  stages: StageInfo[];
  initialCards: BoardCard[];
  templates: TemplateOption[];
  companyName: string;
  recruiterName: string;
  publicUrl: string;
  permissions: { move: boolean; reject: boolean; email: boolean; tag: boolean; create: boolean; note: boolean; evaluate: boolean };
  initialOpenId: string | null;
  meId: string;
}) {
  const t = useTranslations("pipeline");
  const tx = loose(useTranslations());
  const router = useRouter();
  const [cards, setCards] = useState(() => new Map(initialCards.map((c) => [c.id, c])));
  const [columns, setColumns] = useState<Columns>(() => buildColumns(stages, initialCards));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastToggled, setLastToggled] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const snapshot = useRef<Columns | null>(null);
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [rejectIds, setRejectIds] = useState<string[] | null>(null);
  const [emailIds, setEmailIds] = useState<string[] | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  // Server data changes (router.refresh, stage edits): resynchronise local state.
  const [source, setSource] = useState({ stages, initialCards });
  if (source.stages !== stages || source.initialCards !== initialCards) {
    setSource({ stages, initialCards });
    setCards(new Map(initialCards.map((c) => [c.id, c])));
    setColumns(buildColumns(stages, initialCards));
  }

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const rejectedStage = stages.find((s) => s.kind === "rejected");
  const filterTerms = fold(filter.trim());
  const matches = useCallback(
    (card: BoardCard) =>
      !filterTerms ||
      fold(`${card.firstName} ${card.lastName}`).includes(filterTerms) ||
      card.tags.some((tag) => fold(tag).includes(filterTerms)),
    [filterTerms],
  );
  const filtering = filterTerms.length > 0;

  /** Cards in reading order, used for J/K navigation in the panel. */
  const orderedIds = useMemo(
    () => stages.flatMap((s) => (s.kind === "rejected" && !rejectedOpen && openId && cards.get(openId)?.stageId !== s.id ? [] : columns[s.id] ?? [])).filter((id) => {
      const card = cards.get(id);
      return card ? matches(card) : false;
    }),
    [stages, columns, cards, matches, rejectedOpen, openId],
  );

  const open = useCallback((id: string | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("a", id);
    else url.searchParams.delete("a");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    if (!openId) return;
    const el = document.querySelector<HTMLElement>(`[data-card-id="${openId}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [openId]);

  const findColumn = (id: UniqueIdentifier): string | undefined => {
    const key = String(id);
    if (key.startsWith("column:")) return key.slice("column:".length);
    return Object.keys(columns).find((stageId) => columns[stageId]!.includes(key));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const nameOf = (id: UniqueIdentifier) => {
    const card = cards.get(String(id));
    return card ? `${card.firstName} ${card.lastName}` : "";
  };
  const stageName = (id: UniqueIdentifier | undefined) => (id ? (stageById.get(findColumn(id) ?? "")?.name ?? "") : "");
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("dnd.pickedUp", { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? t("dnd.over", { name: nameOf(active.id), stage: stageName(over.id) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? t("dnd.dropped", { name: nameOf(active.id), stage: stageName(over.id) }) : undefined),
    onDragCancel: ({ active }) => t("dnd.cancelled", { name: nameOf(active.id) }),
  };

  const applyMove = (ids: string[], stageId: string, index: number, previousColumns: Columns) => {
    setCards((prev) => {
      const next = new Map(prev);
      const kind = stageById.get(stageId)?.kind;
      for (const id of ids) {
        const card = next.get(id);
        if (card) next.set(id, { ...card, stageId, rejected: kind === "rejected", isNew: kind === "rejected" ? false : card.isNew });
      }
      return next;
    });
    moveApplicationsAction(ids, stageId, index).then((result) => {
      if (!result.ok) {
        setColumns(previousColumns);
        setCards((prev) => {
          const next = new Map(prev);
          for (const id of ids) {
            const card = next.get(id);
            const from = Object.keys(previousColumns).find((s) => previousColumns[s]!.includes(id));
            if (card && from) next.set(id, { ...card, stageId: from, rejected: stageById.get(from)?.kind === "rejected" });
          }
          return next;
        });
        toast({ message: t("toasts.moveFailed"), tone: "danger" });
        return;
      }
      const stage = stageById.get(stageId)?.name ?? "";
      const previous = result.data;
      toast({
        message: t("toasts.moved", { count: ids.length, stage }),
        action: {
          label: tx("common.undo"),
          onClick: () => {
            setColumns(previousColumns);
            setCards((prev) => {
              const next = new Map(prev);
              for (const p of previous) {
                const card = next.get(p.id);
                if (card) next.set(p.id, { ...card, stageId: p.stageId, rejected: stageById.get(p.stageId)?.kind === "rejected" });
              }
              return next;
            });
            undoMoveAction(previous).then((r) => toast(r.ok ? t("toasts.undone") : { message: tx(r.ok ? "" : r.error), tone: "danger" }));
          },
        },
      });
    });
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id);
    snapshot.current = columns;
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(active.id);
    const to = findColumn(over.id);
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const source = prev[from]!.filter((id) => id !== active.id);
      const target = [...prev[to]!];
      const overIndex = String(over.id).startsWith("column:") ? target.length : target.indexOf(String(over.id));
      target.splice(overIndex < 0 ? target.length : overIndex, 0, String(active.id));
      return { ...prev, [from]: source, [to]: target };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const before = snapshot.current ?? columns;
    snapshot.current = null;
    if (!over) return setColumns(before);
    const to = findColumn(over.id);
    if (!to) return setColumns(before);
    let next = columns;
    const list = columns[to]!;
    const oldIndex = list.indexOf(String(active.id));
    const overIndex = String(over.id).startsWith("column:") ? list.length - 1 : list.indexOf(String(over.id));
    if (oldIndex !== -1 && overIndex !== -1 && oldIndex !== overIndex) {
      next = { ...columns, [to]: arrayMove(list, oldIndex, overIndex) };
      setColumns(next);
    }
    const id = String(active.id);
    const originalStage = Object.keys(before).find((s) => before[s]!.includes(id));
    const finalIndex = next[to]!.indexOf(id);
    if (originalStage === to && before[to]!.indexOf(id) === finalIndex) return;
    // Rejecting asks for a reason and an email: the card goes back until confirmed.
    if (stageById.get(to)?.kind === "rejected" && originalStage !== to) {
      setColumns(before);
      if (permissions.reject) setRejectIds([id]);
      return;
    }
    applyMove([id], to, finalIndex, before);
  };

  const moveSelection = (stageId: string) => {
    const ids = [...selected];
    if (stageById.get(stageId)?.kind === "rejected") return setRejectIds(ids);
    const before = columns;
    const next: Columns = Object.fromEntries(Object.entries(columns).map(([s, list]) => [s, list.filter((id) => !selected.has(id))]));
    next[stageId] = [...ids, ...next[stageId]!];
    setColumns(next);
    applyMove(ids, stageId, 0, before);
    setSelected(new Set());
  };

  const toggle = useCallback(
    (id: string, range: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (range && lastToggled) {
          const flat = stages.flatMap((s) => columns[s.id] ?? []);
          const [a, b] = [flat.indexOf(lastToggled), flat.indexOf(id)].sort((x, y) => x - y);
          if (a! >= 0) for (const x of flat.slice(a, b! + 1)) next.add(x);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastToggled(id);
    },
    [lastToggled, stages, columns, setSelected, setLastToggled],
  );

  const onRejected = (ids: string[]) => {
    if (!rejectedStage) return;
    setColumns((prev) => {
      const next: Columns = Object.fromEntries(Object.entries(prev).map(([s, list]) => [s, list.filter((id) => !ids.includes(id))]));
      next[rejectedStage.id] = [...next[rejectedStage.id]!, ...ids];
      return next;
    });
    setCards((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        const card = next.get(id);
        if (card) next.set(id, { ...card, stageId: rejectedStage.id, rejected: true, isNew: false });
      }
      return next;
    });
    setSelected(new Set());
    router.refresh();
  };

  const recipientsFor = (ids: string[]): Recipient[] =>
    ids
      .map((id) => cards.get(id))
      .filter((c): c is BoardCard => Boolean(c))
      .map((c) => ({ applicationId: c.id, firstName: c.firstName, lastName: c.lastName, jobTitle: job.title, email: null }));

  const addTagToSelection = async () => {
    const name = tagName.trim();
    if (!name) return;
    const ids = [...selected];
    const candidateIds = [...new Set(ids.map((id) => cards.get(id)?.candidateId).filter((x): x is string => Boolean(x)))];
    const result = await addTagAction(candidateIds, name);
    if (!result.ok || !result.data) return void toast({ message: tx(result.ok ? "common.unknownError" : result.error), tone: "danger" });
    const tag = result.data.name;
    setCards((prev) => {
      const next = new Map(prev);
      for (const card of next.values()) {
        if (candidateIds.includes(card.candidateId) && !card.tags.includes(tag)) next.set(card.id, { ...card, tags: [...card.tags, tag].sort() });
      }
      return next;
    });
    setTagName("");
    setTagOpen(false);
    toast(t("toasts.tagged"));
  };

  const activeCard = activeId ? cards.get(String(activeId)) : undefined;
  const total = cards.size;
  const visibleStages = stages;

  const onPanelChange = useCallback(() => router.refresh(), [router]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className={cn("flex min-w-0 flex-1 flex-col", openId && "hidden xl:flex")}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2 md:px-6">
          <div className="relative w-full max-w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("filter")}
              aria-label={t("filterLabel")}
              className="pr-8 pl-8"
            />
            {filter ? (
              <button
                type="button"
                onClick={() => setFilter("")}
                aria-label={tx("common.close")}
                className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ink-muted hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <p className="text-13 text-ink-muted tabular-nums">{t("count", { count: total })}</p>
          <span className="flex-1" />
          {permissions.create ? (
            <Button size="sm" onClick={() => setManualOpen(true)}>
              <UserPlus aria-hidden="true" />
              {t("addCandidate")}
            </Button>
          ) : null}
        </div>
        <p id="pipeline-help" className="sr-only">
          {t("help")}
        </p>

        {total === 0 ? (
          <div className="mx-4 mt-2 rounded-md border border-line bg-paper md:mx-6">
            <EmptyState
              title={t("emptyBoard")}
              description={job.status === "published" ? t("emptyBoardPublished") : t("emptyBoardDraft")}
              action={
                job.status === "published" ? (
                  <Button
                    onClick={async () => {
                      await navigator.clipboard.writeText(publicUrl);
                      toast(tx("common.copied"));
                    }}
                  >
                    {t("copyLink")}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setActiveId(null);
              if (snapshot.current) setColumns(snapshot.current);
              snapshot.current = null;
            }}
            accessibility={{ announcements, screenReaderInstructions: { draggable: t("help") } }}
          >
            <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto px-4 pb-24 md:px-6" role="region" aria-label={t("board")} aria-describedby="pipeline-help">
              {visibleStages.map((stage) => {
                const ids = columns[stage.id] ?? [];
                const visible = ids.filter((id) => {
                  const card = cards.get(id);
                  return card ? matches(card) : false;
                });
                const isRejected = stage.kind === "rejected";
                const newCount = ids.filter((id) => cards.get(id)?.isNew).length;
                return (
                  <KanbanColumn
                    key={stage.id}
                    id={stage.id}
                    name={stage.name}
                    kind={stage.kind}
                    itemIds={visible}
                    count={ids.length}
                    newCount={newCount}
                    collapsed={isRejected && !rejectedOpen}
                    onToggleCollapsed={isRejected ? () => setRejectedOpen((v) => !v) : undefined}
                  >
                    {visible.map((id) => (
                      <KanbanCard
                        key={id}
                        card={cards.get(id)!}
                        selected={selected.has(id)}
                        selectionMode={selected.size > 0}
                        active={openId === id}
                        onOpen={open}
                        onToggle={toggle}
                        disabled={!permissions.move || filtering}
                      />
                    ))}
                  </KanbanColumn>
                );
              })}
            </div>
            <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
              {activeCard ? (
                <div className="w-64 cursor-grabbing rounded-sm border border-line-strong bg-paper py-2.5 pr-3 pl-8 shadow-lift">
                  <CardBody card={activeCard} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {selected.size > 0 ? (
          <div
            role="toolbar"
            aria-label={t("selected", { count: selected.size })}
            className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-md border border-line bg-paper p-1.5 pl-3 shadow-float md:left-[calc(50%+28px)] xl:left-[calc(50%+108px)]"
          >
            <span className="mr-2 text-13 font-medium tabular-nums">{t("selected", { count: selected.size })}</span>
            {permissions.move ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">{t("moveTo")}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top">
                  {stages.map((s) => (
                    <DropdownMenuItem key={s.id} onSelect={() => moveSelection(s.id)}>
                      {s.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {permissions.tag ? (
              <Popover open={tagOpen} onOpenChange={setTagOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm">
                    <TagIcon aria-hidden="true" />
                    {t("addTag")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top">
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void addTagToSelection();
                    }}
                  >
                    <label htmlFor="bulk-tag" className="text-13 font-medium">
                      {t("tagName")}
                    </label>
                    <Input id="bulk-tag" autoFocus value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder={t("tagPlaceholder")} maxLength={40} />
                    <Button type="submit" size="sm" variant="primary" className="self-end">
                      {t("apply")}
                    </Button>
                  </form>
                </PopoverContent>
              </Popover>
            ) : null}
            {permissions.email ? (
              <Button size="sm" onClick={() => setEmailIds([...selected])}>
                {t("email")}
              </Button>
            ) : null}
            {permissions.reject ? (
              <Button size="sm" onClick={() => setRejectIds([...selected].filter((id) => !cards.get(id)?.rejected))}>
                {t("reject")}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t("clearSelection")}
            </Button>
          </div>
        ) : null}
      </div>


      {rejectIds ? (
        <RejectDialog
          open
          onOpenChange={(o) => !o && setRejectIds(null)}
          recipients={recipientsFor(rejectIds)}
          templates={templates}
          companyName={companyName}
          recruiterName={recruiterName}
          onRejected={onRejected}
        />
      ) : null}
      {emailIds ? (
        <EmailComposer
          open
          onOpenChange={(o) => !o && setEmailIds(null)}
          recipients={recipientsFor(emailIds)}
          templates={templates}
          companyName={companyName}
          recruiterName={recruiterName}
          onSent={() => {
            setSelected(new Set());
            router.refresh();
          }}
        />
      ) : null}
      {manualOpen ? <ManualCandidateDialog jobId={job.id} onClose={() => setManualOpen(false)} onAdded={() => router.refresh()} /> : null}
    </div>
  );
}
