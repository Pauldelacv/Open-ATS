"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Mark } from "@/components/ui/mark";
import { cn } from "@/lib/cn";
import type { StageKind } from "@/lib/db/schema";

export function KanbanColumn({
  id,
  name,
  kind,
  itemIds,
  count,
  newCount,
  collapsed,
  onToggleCollapsed,
  children,
}: {
  id: string;
  name: string;
  kind: StageKind;
  itemIds: string[];
  count: number;
  newCount: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("pipeline");
  const tj = useTranslations("jobs.list");
  const { setNodeRef, isOver } = useDroppable({ id: `column:${id}`, data: { type: "column", stageId: id } });

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-label={`${name}, ${t("count", { count })}`}
        className={cn(
          "flex w-12 shrink-0 flex-col items-center gap-3 rounded-md bg-stone-strong py-3 transition-colors duration-[120ms]",
          isOver && "bg-cobalt-tint ring-1 ring-cobalt",
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex flex-col items-center gap-3 rounded-sm px-1 text-13 font-medium text-ink-muted hover:text-ink"
          aria-label={t("showRejected")}
        >
          <span className="text-12 text-ink tabular-nums">{count}</span>
          <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{name}</span>
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label={`${name}, ${t("count", { count })}`}
      className={cn(
        "flex w-68 shrink-0 flex-col rounded-md bg-stone-strong transition-colors duration-[120ms]",
        isOver && "ring-1 ring-cobalt",
      )}
    >
      <header className="flex h-10 items-center justify-between gap-2 px-3">
        <h2 className="flex min-w-0 items-center gap-2 text-13 font-semibold text-ink">
          <span className={cn("truncate", kind === "hired" && "text-success", kind === "rejected" && "text-ink-muted")}>{name}</span>
          <span className="font-normal text-ink-muted tabular-nums">{count}</span>
        </h2>
        <span className="flex items-center gap-1">
          {newCount > 0 ? <Mark className="text-12">{tj("new", { count: newCount })}</Mark> : null}
          {onToggleCollapsed ? (
            <button type="button" onClick={onToggleCollapsed} className="h-6 rounded-sm px-1.5 text-12 text-ink-muted hover:bg-stone hover:text-ink">
              {t("hideRejected")}
            </button>
          ) : null}
        </span>
      </header>
      <SortableContext id={id} items={itemIds} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
          {children}
          {itemIds.length === 0 ? (
            <li className="flex h-16 items-center justify-center rounded-sm border border-dashed border-line-strong/60 text-12 text-ink-muted">
              {t("emptyColumn")}
            </li>
          ) : null}
        </ul>
      </SortableContext>
    </section>
  );
}
