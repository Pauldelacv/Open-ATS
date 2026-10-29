"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Sections of a job (candidates, distribution, rules), as tabs on the header's bottom line. */
export function JobNav({
  items,
  label,
}: {
  items: Array<{ href: string; label: string }>;
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mb-px [scrollbar-width:none] overflow-x-auto">
      <ul className="flex gap-5">
        {items.map((item, index) => {
          const active = index === 0 ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center border-b-2 text-14 font-medium whitespace-nowrap focus-visible:outline-offset-[-2px]",
                  active
                    ? "border-ink text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
