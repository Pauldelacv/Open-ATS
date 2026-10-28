"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function SettingsNav({
  items,
  label,
}: {
  items: Array<{ href: string; label: string }>;
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0"
    >
      <ul className="flex gap-1 border-b border-line md:flex-col md:gap-0.5 md:border-b-0">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center text-14 font-medium whitespace-nowrap md:h-8 md:rounded-sm md:px-2 md:text-13",
                  "-mb-px border-b-2 px-2 md:mb-0 md:border-b-0",
                  active
                    ? "border-ink text-ink md:bg-stone-strong"
                    : "border-transparent text-ink-muted hover:text-ink md:hover:bg-stone-strong/60",
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
