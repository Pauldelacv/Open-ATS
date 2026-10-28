"use client";

import { FileText } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/cn";

export type DropzoneLabels = {
  prompt: string;
  browse: string;
  constraints: string;
  replace: string;
  remove: string;
};

export function formatBytes(bytes: number, locale: string): string {
  const units = ["o", "Ko", "Mo"];
  const unitsEn = ["B", "KB", "MB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < 2) {
    value /= 1024;
    unit++;
  }
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
  return `${formatted} ${(locale.startsWith("fr") ? units : unitsEn)[unit]}`;
}

export function Dropzone({
  file,
  onFile,
  accept,
  labels,
  error,
  locale,
  name,
  id,
  disabled,
  size = "md",
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  accept: string;
  labels: DropzoneLabels;
  error?: string;
  locale: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    if (disabled) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-md border border-dashed bg-paper transition-colors duration-[120ms]",
        "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-cobalt",
        over ? "border-cobalt bg-cobalt-tint" : error ? "border-danger" : "border-line-strong",
        disabled && "bg-stone",
      )}
    >
      <input
        ref={input}
        id={inputId}
        name={name}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className={cn("flex items-center gap-3", size === "lg" ? "px-4 py-3" : "px-3 py-2.5")}>
          <FileText className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-14 font-medium text-ink">{file.name}</p>
            <p className="text-13 text-ink-muted tabular-nums">{formatBytes(file.size, locale)}</p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
            className="h-7 rounded-sm px-2 text-13 font-medium text-cobalt hover:bg-cobalt-tint"
          >
            {labels.replace}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (input.current) input.current.value = "";
              onFile(null);
            }}
            className="h-7 rounded-sm px-2 text-13 font-medium text-ink-muted hover:bg-stone hover:text-ink"
          >
            {labels.remove}
          </button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "flex cursor-pointer flex-col items-center text-center",
            size === "lg" ? "gap-1 px-4 py-6" : "gap-0.5 px-3 py-4",
            disabled && "cursor-not-allowed",
          )}
        >
          <span className={cn("text-ink", size === "lg" ? "text-16" : "text-14")}>
            {labels.prompt}{" "}
            <span className={cn("font-medium underline underline-offset-2", disabled ? "text-ink-muted" : "text-brand-link")}>
              {labels.browse}
            </span>
          </span>
          <span className="text-13 text-ink-muted">{labels.constraints}</span>
        </label>
      )}
    </div>
  );
}
