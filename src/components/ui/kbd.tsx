import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-line bg-paper px-1 font-sans text-12 text-ink-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
