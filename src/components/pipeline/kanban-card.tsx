"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CalendarDays } from "lucide-react";
import { CSS } from "@dnd-kit/utilities";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { RatingDots } from "@/components/ui/rating";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import type { BoardCard } from "@/lib/services/pipeline";

type CardProps = {
  card: BoardCard;
  selected: boolean;
  selectionMode: boolean;
  active: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string, range: boolean) => void;
  disabled: boolean;
};

export function CardBody({ card }: { card: BoardCard }) {
  const t = useTranslations("pipeline");
  const timeZone = useTimeZone() ?? "Europe/Paris";
  const tr = useTranslations("ui.rating");
  const locale = useLocale();
  const name = `${card.firstName} ${card.lastName}`;
  return (
    <>
      <span className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "min-w-0 truncate text-14 font-medium",
            card.rejected ? "text-ink-muted" : "text-ink",
          )}
        >
          {name}
        </span>
        {card.averageRating !== null ? (
          <RatingDots
            value={card.averageRating}
            label={tr("average", {
              value: card.averageRating.toLocaleString(locale, { maximumFractionDigits: 1 }),
            })}
            className="mt-1.5 shrink-0"
          />
        ) : null}
      </span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-12 text-ink-muted tabular-nums">
        <span>{t("applied", { date: formatRelative(card.appliedAt, locale) })}</span>
        {card.evaluationCount > 0 && card.averageRating === null ? (
          <span>{t("evaluations", { count: card.evaluationCount })}</span>
        ) : null}
        {!card.hasCv ? <span>{t("noCv")}</span> : null}
        {card.nextInterviewAt ? (
          <span className="inline-flex items-center gap-1 text-ink">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {t("nextInterview", {
              date: new Intl.DateTimeFormat(locale, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                timeZone,
              }).format(new Date(card.nextInterviewAt)),
            })}
          </span>
        ) : null}
        {card.unreadReplies > 0 ? (
          <span className="inline-flex items-center gap-1 font-medium text-cobalt">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-cobalt" />
            {t("unreadReplies", { count: card.unreadReplies })}
          </span>
        ) : null}
      </span>
      {card.tags.length > 0 ? (
        <span className="mt-2 flex flex-wrap gap-1">
          {card.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex h-5 max-w-full items-center truncate rounded-sm border border-line bg-paper px-1.5 text-12 text-ink"
            >
              {tag}
            </span>
          ))}
          {card.tags.length > 2 ? (
            <span className="inline-flex h-5 items-center px-1 text-12 text-ink-muted">
              +{card.tags.length - 2}
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );
}

/** The card as it follows the pointer during a drag. */
export function CardOverlay({ card }: { card: BoardCard }) {
  return (
    <div className="w-64 cursor-grabbing rounded-sm border border-line-strong bg-paper py-2.5 pr-3 pl-8 shadow-lift">
      <CardBody card={card} />
    </div>
  );
}

export const KanbanCard = memo(function KanbanCard({
  card,
  selected,
  selectionMode,
  active,
  onOpen,
  onToggle,
  disabled,
}: CardProps) {
  const t = useTranslations("pipeline");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", stageId: card.stageId },
    disabled,
  });
  const name = `${card.firstName} ${card.lastName}`;

  const onClick = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      event.preventDefault();
      onToggle(card.id, event.shiftKey);
      return;
    }
    onOpen(card.id);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onOpen(card.id);
      return;
    }
    if (event.key === "x" || event.key === "X") {
      event.preventDefault();
      onToggle(card.id, false);
      return;
    }
    listeners?.onKeyDown?.(event);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group relative", isDragging && "opacity-40")}
      data-card-id={card.id}
    >
      <div
        {...attributes}
        {...listeners}
        onKeyDown={onKeyDown}
        onClick={onClick}
        aria-label={t("open", { name })}
        aria-current={active ? "true" : undefined}
        data-focus-inset
        className={cn(
          "relative block w-full cursor-grab rounded-sm border bg-paper py-2.5 pr-3 text-left transition-colors duration-[120ms] active:cursor-grabbing",
          "pl-8",
          active
            ? "border-cobalt ring-1 ring-cobalt"
            : selected
              ? "border-cobalt bg-cobalt-tint"
              : "border-line hover:border-line-strong",
          card.rejected && "bg-stone",
        )}
      >
        {card.isNew ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-xs bg-highlighter"
          />
        ) : null}
        <CardBody card={card} />
      </div>
      <span
        className={cn(
          "absolute top-2.5 left-2.5 inline-flex",
          selected || selectionMode
            ? "opacity-100"
            : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(card.id, false)}
          onClick={(e) => {
            if (e.shiftKey) {
              e.preventDefault();
              onToggle(card.id, true);
            }
          }}
          aria-label={t("select", { name })}
          className="size-4 cursor-pointer appearance-none rounded-xs border border-ink-muted bg-paper checked:border-cobalt checked:bg-cobalt checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20d%3D%22M4%208.5%206.8%2011%2012%205.5%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%221.75%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')]"
        />
      </span>
    </li>
  );
});
