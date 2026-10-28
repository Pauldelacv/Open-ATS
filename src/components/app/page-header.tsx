import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  actions,
  before,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  before?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {before}
        <h1 className="text-24 font-semibold text-ink">{title}</h1>
        {description ? <div className="mt-1 text-14 text-ink-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 py-5 md:px-6 md:py-6", className)}>{children}</div>;
}
