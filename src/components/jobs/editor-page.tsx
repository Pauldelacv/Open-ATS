import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-1 inline-flex items-center gap-1 rounded-sm text-13 text-ink-muted hover:text-ink">
      <ChevronLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}
