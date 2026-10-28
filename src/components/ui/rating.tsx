"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

/** Five-point rating as a radio group: arrow keys and 1–5 work out of the box. */
export function RatingInput({
  value,
  onChange,
  label,
  valueLabels,
  disabled,
  name,
}: {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
  /** Accessible names for 1 to 5, e.g. « 1 sur 5 ». */
  valueLabels: string[];
  disabled?: boolean;
  name?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value !== null && n <= value;
        return (
          <label key={n} className={cn("relative inline-flex", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
            <input
              type="radio"
              name={name ?? id}
              value={n}
              checked={value === n}
              disabled={disabled}
              onChange={() => onChange(n)}
              aria-label={valueLabels[n - 1]}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full border text-12 font-medium tabular-nums transition-colors duration-[120ms]",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cobalt",
                filled ? "border-ink bg-ink text-paper" : "border-line-strong bg-paper text-ink-muted hover:border-ink",
                disabled && "opacity-60",
              )}
            >
              {n}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Read-only rating: filled dots and an accessible text such as « 3,8 sur 5 ». */
export function RatingDots({ value, label, className }: { value: number; label: string; className?: string }) {
  const rounded = Math.round(value);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", n <= rounded ? "bg-ink" : "bg-line")}
        />
      ))}
    </span>
  );
}
