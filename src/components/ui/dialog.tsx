"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  closeLabel,
  width = "md",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  width?: "sm" | "md" | "lg";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-[12vh] left-1/2 z-50 flex max-h-[80vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col",
          "rounded-lg bg-paper shadow-lift data-[state=open]:animate-dialog-in",
          width === "sm" && "max-w-sm",
          width === "md" && "max-w-lg",
          width === "lg" && "max-w-2xl",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-4">
          <div>
            <DialogPrimitive.Title className="text-20 font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-14 text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-stone hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5", className)} {...props} />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
