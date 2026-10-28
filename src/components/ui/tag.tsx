import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Tag({
  children,
  onRemove,
  removeLabel,
  className,
}: {
  children: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-0.5 rounded-sm border border-line bg-paper pl-1.5 text-12 text-ink",
        !onRemove && "pr-1.5",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="inline-flex size-4 items-center justify-center rounded-xs text-ink-muted hover:bg-stone hover:text-ink"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
