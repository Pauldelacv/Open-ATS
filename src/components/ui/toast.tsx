"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

export type ToastInput = {
  message: string;
  tone?: "default" | "danger";
  action?: { label: string; onClick: () => void };
  /** Milliseconds, 6 s by default. */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function toast(input: ToastInput | string): number {
  const value = typeof input === "string" ? { message: input } : input;
  const id = nextId++;
  // Keep the three most recent: older confirmations are no longer actionable.
  items = [...items.slice(-2), { ...value, id }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: ToastItem[] = [];

export function Toaster({ closeLabel }: { closeLabel: string }) {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );
  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed bottom-4 left-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
    >
      {list.map((t) => (
        <ToastView key={t.id} item={t} closeLabel={closeLabel} />
      ))}
    </div>
  );
}

function ToastView({ item, closeLabel }: { item: ToastItem; closeLabel: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => dismissToast(item.id), item.duration ?? 6000);
  };
  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      role={item.tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => clearTimeout(timer.current)}
      onMouseLeave={start}
      onFocus={() => clearTimeout(timer.current)}
      onBlur={start}
      className={cn(
        "pointer-events-auto flex min-h-11 animate-toast-in items-center gap-3 rounded-md py-2 pr-2 pl-3.5 text-14 shadow-float",
        item.tone === "danger" ? "bg-danger text-paper" : "bg-ink text-paper",
      )}
    >
      <p className="min-w-0 flex-1">{item.message}</p>
      {item.action ? (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            dismissToast(item.id);
          }}
          className="h-7 shrink-0 rounded-sm px-2 text-14 font-medium text-paper underline-offset-2 hover:bg-paper/10 focus-visible:outline-paper"
        >
          {item.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={closeLabel}
        onClick={() => dismissToast(item.id)}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-paper/70 hover:bg-paper/10 hover:text-paper focus-visible:outline-paper"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
