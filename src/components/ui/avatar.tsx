import { cn } from "@/lib/cn";
import { initials } from "@/lib/utils/text";

export function Avatar({ name, size = 24, className }: { name: string; size?: 24 | 32; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-stone font-medium text-ink",
        size === 24 ? "size-6 text-12" : "size-8 text-13",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
