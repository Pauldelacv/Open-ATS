import type { ReactNode } from "react";

export function AuthPanel({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-paper px-5 py-6 md:px-6">
      <h1 className="text-24 font-semibold text-ink">{title}</h1>
      {subtitle ? <p className="mt-1 text-14 text-ink-muted">{subtitle}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}
