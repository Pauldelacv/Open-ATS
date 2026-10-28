"use client";

import { MapPin, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { ContractType, RemotePolicy } from "@/lib/db/schema";

export type PublicJobRow = {
  id: string;
  title: string;
  slug: string;
  department: string | null;
  location: string | null;
  remote: RemotePolicy;
  contract: ContractType;
};

function subscribeToWidth(callback: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

type Filters = { department: string; location: string; contract: string; remote: string };
const EMPTY: Filters = { department: "", location: "", contract: "", remote: "" };

const distinct = (values: Array<string | null>) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));

export function CareersJobList({ orgSlug, jobs }: { orgSlug: string; jobs: PublicJobRow[] }) {
  const t = useTranslations("careers");
  const tj = useTranslations("jobs");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState(false);

  const options = useMemo(
    () => ({
      department: distinct(jobs.map((j) => j.department)),
      location: distinct(jobs.map((j) => j.location)),
      contract: distinct(jobs.map((j) => j.contract)),
      remote: distinct(jobs.map((j) => j.remote)),
    }),
    [jobs],
  );
  const available = (Object.keys(options) as Array<keyof Filters>).filter((k) => options[k].length > 1);
  const activeCount = Object.values(filters).filter(Boolean).length;
  const visible = jobs.filter(
    (j) =>
      (!filters.department || j.department === filters.department) &&
      (!filters.location || j.location === filters.location) &&
      (!filters.contract || j.contract === filters.contract) &&
      (!filters.remote || j.remote === filters.remote),
  );

  const label = (key: keyof Filters, value: string) =>
    key === "contract" ? tj(`contract.${value as ContractType}`) : key === "remote" ? tj(`remote.${value as RemotePolicy}`) : value;
  // On wide screens the empty choice shows the filter name, like a compact filter bar.
  const allLabel = {
    department: t("filters.allDepartments"),
    location: t("filters.allLocations"),
    contract: t("filters.allContracts"),
    remote: t("filters.allRemote"),
  };
  const shortLabel = {
    department: t("filters.department"),
    location: t("filters.location"),
    contract: t("filters.contract"),
    remote: t("filters.remote"),
  };
  const wide = useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia("(min-width: 768px)").matches,
    () => true,
  );

  return (
    <div>
      {available.length > 0 ? (
        <div className="mb-3">
          <div className="flex items-center justify-between gap-3 md:hidden">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="career-filters"
              className="inline-flex h-10 items-center gap-2 rounded-sm border border-line-strong bg-paper px-3 text-14 font-medium text-ink"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {t("filters.button")}
              {activeCount > 0 ? <span className="text-ink-muted">({t("filters.active", { count: activeCount })})</span> : null}
            </button>
            <p className="text-14 text-ink-muted tabular-nums" aria-live="polite">
              {t("filters.results", { count: visible.length })}
            </p>
          </div>
          <div
            id="career-filters"
            role="group"
            aria-label={t("filters.label")}
            className={cn("mt-3 grid gap-3 sm:grid-cols-2 md:mt-0 md:flex md:items-center", open ? "grid" : "hidden md:flex")}
          >
            {available.map((key) => (
              <label key={key} className="flex flex-col gap-1 md:block md:min-w-0 md:flex-1">
                <span className="text-13 font-medium md:sr-only">{t(`filters.${key}`)}</span>
                <Select
                  size="lg"
                  value={filters[key]}
                  onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
                >
                  <option value="">{wide ? shortLabel[key] : allLabel[key]}</option>
                  {options[key].map((value) => (
                    <option key={value} value={value}>
                      {label(key, value)}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
            {activeCount > 0 ? (
              <button type="button" onClick={() => setFilters(EMPTY)} className="h-10 rounded-sm px-2 text-14 font-medium text-brand-link hover:underline md:ml-1">
                {t("filters.clear")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-md border border-line px-4 py-8 text-center">
          <p className="text-16 text-ink">{t("filters.noResults")}</p>
          <button type="button" onClick={() => setFilters(EMPTY)} className="mt-3 text-14 font-medium text-brand-link hover:underline">
            {t("filters.clear")}
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {visible.map((job) => (
            <li key={job.id}>
              <Link
                href={`/careers/${orgSlug}/jobs/${job.slug}`}
                className="group flex flex-col gap-1 py-4 focus-visible:outline-offset-[-2px] md:px-2"
              >
                <span className="text-16 font-semibold text-ink group-hover:text-brand-link group-hover:underline group-hover:underline-offset-2">
                  {job.title}
                </span>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-14 text-ink-muted">
                  {job.department ? <span>{job.department}</span> : null}
                  {job.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-4" aria-hidden="true" />
                      {job.location}
                    </span>
                  ) : null}
                  <span>{tj(`contract.${job.contract}`)}</span>
                  {job.remote !== "onsite" ? <span>{tj(`remote.${job.remote}`)}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
