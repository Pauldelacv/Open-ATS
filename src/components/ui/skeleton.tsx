import { cn } from "@/lib/cn";

/** Placeholder with the shape of the content being loaded. No shimmer. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block rounded-sm bg-stone-strong", className)} />;
}
