"use client";

import { Check } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuSub = Menu.Sub;

const surface =
  "z-50 min-w-48 rounded-md border border-line bg-paper p-1 shadow-float data-[state=open]:animate-fade-in";

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = "start",
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(surface, className)}
        {...props}
      />
    </Menu.Portal>
  );
}

const item = [
  "relative flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-14 text-ink outline-none select-none",
  "data-[highlighted]:bg-stone data-[disabled]:text-ink-subtle [&_svg]:size-4 [&_svg]:text-ink-muted",
].join(" ");

export function DropdownMenuItem({
  className,
  tone,
  ...props
}: ComponentProps<typeof Menu.Item> & { tone?: "danger" }) {
  return (
    <Menu.Item
      className={cn(item, tone === "danger" && "text-danger [&_svg]:text-danger", className)}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(item, "pl-8", className)} {...props}>
      <Menu.ItemIndicator className="absolute left-2 inline-flex">
        <Check aria-hidden="true" />
      </Menu.ItemIndicator>
      {children}
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label className={cn("px-2 pt-1.5 pb-1 text-12 text-ink-muted", className)} {...props} />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
}

export function DropdownMenuSubTrigger({
  className,
  ...props
}: ComponentProps<typeof Menu.SubTrigger>) {
  return (
    <Menu.SubTrigger className={cn(item, "data-[state=open]:bg-stone", className)} {...props} />
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent className={cn(surface, className)} {...props} />
    </Menu.Portal>
  );
}
