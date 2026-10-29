import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A settings block: title and description on the left (wide screens), fields on the right. */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border border-line bg-paper", className)}>
      <div className="border-b border-line px-4 py-3 md:px-5">
        <h2 className="text-16 font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-13 text-ink-muted">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-4 px-4 py-4 md:px-5 md:py-5">{children}</div>
    </section>
  );
}
