import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The highlighter. Reserved for new items, mentions of the viewer and search hits. */
export function Mark({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <mark
      className={cn(
        "rounded-xs bg-highlighter [box-decoration-break:clone] px-0.5 text-ink",
        className,
      )}
    >
      {children}
    </mark>
  );
}

/** Renders `text` with the given [start, end) ranges highlighted. */
export function Highlighted({ text, ranges }: { text: string; ranges: Array<[number, number]> }) {
  if (ranges.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<Mark key={i}>{text.slice(start, end)}</Mark>);
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
