"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function PoolFilters({
  tags,
  jobs,
}: {
  tags: Array<{ id: string; name: string }>;
  jobs: Array<{ id: string; title: string }>;
}) {
  const t = useTranslations("pool");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [pending, start] = useTransition();
  const first = useRef(true);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => update({ q: query.trim() }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative w-full lg:max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        <Input
          type="search"
          size="lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("searchLabel")}
          className="pr-9 pl-9 text-14 [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute top-1/2 right-2.5 -translate-y-1/2">
          {pending ? (
            <Spinner className="text-ink-muted" />
          ) : query ? (
            <button
              type="button"
              aria-label={t("clear")}
              onClick={() => setQuery("")}
              className="inline-flex size-6 items-center justify-center rounded-sm text-ink-muted hover:text-ink"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex">
        <Select
          aria-label={t("tag")}
          value={params.get("tag") ?? ""}
          onChange={(e) => update({ tag: e.target.value })}
          className="lg:w-44"
        >
          <option value="">{t("allTags")}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t("job")}
          value={params.get("job") ?? ""}
          onChange={(e) => update({ job: e.target.value })}
          className="lg:w-56"
        >
          <option value="">{t("allJobs")}</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t("status")}
          value={params.get("status") ?? ""}
          onChange={(e) => update({ status: e.target.value })}
          className="lg:w-40"
        >
          <option value="">{t("allStatuses")}</option>
          {(["active", "hired", "rejected"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
