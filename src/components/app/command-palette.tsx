"use client";

import { Command } from "cmdk";
import { AtSign, Briefcase, Plus, Settings, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { useCommandPalette } from "./command-palette-context";

type SearchResult = {
  jobs: Array<{ id: string; title: string; status: "draft" | "published" | "archived" }>;
  candidates: Array<{ id: string; name: string; email: string | null; applicationId: string | null; jobId: string | null; jobTitle: string | null }>;
};

const itemClass =
  "flex h-9 cursor-default items-center gap-2.5 rounded-sm px-2 text-14 text-ink select-none data-[selected=true]:bg-stone [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-muted";

export function CommandPalette({ canCreateJob }: { canCreateJob: boolean }) {
  const t = useTranslations("palette");
  const tJobs = useTranslations("jobs.status");
  const { isOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const setOpen = (open: boolean) => {
    setPaletteOpen(open);
    if (!open) {
      setQuery("");
      setResults(null);
    }
  };

  const onQuery = (value: string) => {
    setQuery(value);
    if (value.trim().length >= 2) setLoading(true);
    else setResults(null);
  };

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as SearchResult;
        if (id === requestId.current) setResults(data);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const showNavigation = query.trim().length < 2;
  const statusTone = { draft: "muted", published: "success", archived: "neutral" } as const;

  const item = (value: string, onSelect: () => void, children: ReactNode) => (
    <Command.Item value={value} onSelect={onSelect} className={itemClass}>
      {children}
    </Command.Item>
  );

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg bg-paper shadow-lift data-[state=open]:animate-dialog-in"
        >
          <DialogPrimitive.Title className="sr-only">{t("title")}</DialogPrimitive.Title>
          <Command shouldFilter={showNavigation} label={t("title")} loop>
            <Command.Input
              value={query}
              onValueChange={onQuery}
              placeholder={t("placeholder")}
              className="h-12 w-full border-b border-line bg-paper px-4 text-16 text-ink outline-none placeholder:text-ink-subtle"
            />
            <Command.List className="max-h-[min(420px,60vh)] overflow-y-auto p-1.5">
              {!showNavigation && !loading && results && results.jobs.length === 0 && results.candidates.length === 0 ? (
                <p className="px-3 py-6 text-center text-14 text-ink-muted">{t("empty", { query: query.trim() })}</p>
              ) : null}
              {!showNavigation && loading && !results ? (
                <p className="px-3 py-6 text-center text-14 text-ink-muted">{t("searching")}</p>
              ) : null}
              {!showNavigation && results && results.candidates.length > 0 ? (
                <Command.Group heading={t("candidates")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-12 [&_[cmdk-group-heading]]:text-ink-muted">
                  {results.candidates.map((c) =>
                    item(
                      `candidate-${c.id}`,
                      () => go(c.applicationId && c.jobId ? `/jobs/${c.jobId}?a=${c.applicationId}` : `/candidates/${c.id}`),
                      <>
                        <UserRound />
                        <span className="min-w-0 flex-1 truncate">
                          {c.name}
                          {c.email ? <span className="ml-2 text-13 text-ink-muted">{c.email}</span> : null}
                        </span>
                        {c.jobTitle ? <span className="max-w-40 truncate text-13 text-ink-muted">{c.jobTitle}</span> : null}
                      </>,
                    ),
                  )}
                </Command.Group>
              ) : null}
              {!showNavigation && results && results.jobs.length > 0 ? (
                <Command.Group heading={t("jobs")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-12 [&_[cmdk-group-heading]]:text-ink-muted">
                  {results.jobs.map((j) =>
                    item(
                      `job-${j.id}`,
                      () => go(`/jobs/${j.id}`),
                      <>
                        <Briefcase />
                        <span className="min-w-0 flex-1 truncate">{j.title}</span>
                        <Badge tone={statusTone[j.status]}>{tJobs(j.status)}</Badge>
                      </>,
                    ),
                  )}
                </Command.Group>
              ) : null}
              {showNavigation ? (
                <>
                  {canCreateJob ? (
                    <Command.Group heading={t("actions")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-12 [&_[cmdk-group-heading]]:text-ink-muted">
                      {item("create-job", () => go("/jobs/new"), <><Plus />{t("createJob")}</>)}
                    </Command.Group>
                  ) : null}
                  <Command.Group heading={t("navigation")} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-12 [&_[cmdk-group-heading]]:text-ink-muted">
                    {item("go-jobs", () => go("/jobs"), <><Briefcase />{t("goJobs")}</>)}
                    {item("go-candidates", () => go("/candidates"), <><Users />{t("goCandidates")}</>)}
                    {item("go-inbox", () => go("/inbox"), <><AtSign />{t("goInbox")}</>)}
                    {item("go-settings", () => go("/settings"), <><Settings />{t("goSettings")}</>)}
                  </Command.Group>
                </>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-12 text-ink-muted">
              <Kbd>↵</Kbd>
              <Kbd>Esc</Kbd>
              <span>{t("hint")}</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
