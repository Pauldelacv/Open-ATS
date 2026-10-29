import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "muted" | "success" | "danger" | "warning" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-stone-strong text-ink",
  muted: "bg-stone text-ink-muted",
  success: "bg-success-tint text-success",
  danger: "bg-danger-tint text-danger",
  warning: "bg-warning-tint text-warning",
  info: "bg-cobalt-tint text-cobalt",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-1.5 text-12 font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
