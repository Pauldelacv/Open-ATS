"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        // Inset line instead of a border so the list can scroll horizontally on narrow screens.
        "flex [scrollbar-width:none] items-end gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-14 font-medium whitespace-nowrap text-ink-muted",
        "hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink",
        "focus-visible:outline-offset-[-2px] disabled:text-ink-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content className={cn("focus-visible:outline-none", className)} {...props} />
  );
}
