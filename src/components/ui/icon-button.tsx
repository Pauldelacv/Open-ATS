"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./tooltip";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  /** Extra hint in the tooltip, e.g. a keyboard shortcut. */
  hint?: ReactNode;
  size?: "sm" | "md";
  tooltipSide?: "top" | "bottom" | "left" | "right";
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, hint, size = "md", className, children, tooltipSide, type = "button", ...props },
  ref,
) {
  return (
    <Tooltip
      side={tooltipSide}
      content={
        hint ? (
          <span className="flex items-center gap-2">
            {label}
            <span className="text-paper/70">{hint}</span>
          </span>
        ) : (
          label
        )
      }
    >
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-sm text-ink-muted transition-colors duration-[120ms]",
          "hover:bg-stone-strong/70 hover:text-ink active:bg-stone-strong disabled:pointer-events-none disabled:text-ink-subtle/60",
          "[&_svg]:size-4",
          size === "sm" ? "size-7" : "size-8",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
});
