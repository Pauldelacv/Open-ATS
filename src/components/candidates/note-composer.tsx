"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { encodeMentions } from "@/lib/mentions";
import { fold } from "@/lib/utils/text";

type Member = { id: string; name: string };

/** Note textarea with an @mention picker (keyboard friendly). */
export function NoteComposer({
  team,
  onSubmit,
  pending,
}: {
  team: Member[];
  onSubmit: (body: string) => Promise<boolean>;
  pending: boolean;
}) {
  const t = useTranslations("panel.notes");
  const listId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Member[]>([]);
  const [query, setQuery] = useState<{ start: number; value: string } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const suggestions = useMemo(() => {
    if (!query) return [];
    const q = fold(query.value);
    return team.filter((m) => fold(m.name).includes(q)).slice(0, 6);
  }, [query, team]);

  const detect = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const match = /(^|\s)@([\p{L}\p{N} '-]{0,30})$/u.exec(before);
    if (match && !match[2]!.includes("  ")) {
      setQuery({ start: caret - match[2]!.length - 1, value: match[2]! });
      setHighlight(0);
    } else setQuery(null);
  };

  const pick = (member: Member) => {
    if (!query) return;
    const caret = ref.current?.selectionStart ?? text.length;
    const insert = `@${member.name} `;
    const next = text.slice(0, query.start) + insert + text.slice(caret);
    setText(next);
    setPicked((prev) => (prev.some((p) => p.id === member.id) ? prev : [...prev, member]));
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = query.start + insert.length;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  };

  const submit = async () => {
    const body = encodeMentions(
      text.trim(),
      picked.filter((m) => text.includes(`@${m.name}`)),
    );
    if (!body) return;
    if (await onSubmit(body)) {
      setText("");
      setPicked([]);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(suggestions[highlight]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        rows={3}
        value={text}
        placeholder={t("placeholder")}
        aria-label={t("placeholder")}
        aria-autocomplete="list"
        aria-controls={query ? listId : undefined}
        aria-expanded={Boolean(query && suggestions.length)}
        role="combobox"
        onChange={(e) => {
          setText(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {query && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("mentionList")}
          className="absolute top-full left-0 z-20 mt-1 w-64 rounded-md border border-line bg-paper p-1 shadow-float"
        >
          {suggestions.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
              className={cn(
                "flex h-8 cursor-default items-center rounded-sm px-2 text-14",
                i === highlight && "bg-stone",
              )}
            >
              {m.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-12 text-ink-muted">{t("shortcut")}</span>
        <Button
          size="sm"
          variant="primary"
          loading={pending}
          disabled={!text.trim()}
          onClick={() => void submit()}
        >
          {t("submit")}
        </Button>
      </div>
    </div>
  );
}
