"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = Omit<ComponentProps<typeof SwitchPrimitive.Root>, "children"> & {
  label?: ReactNode;
  hint?: ReactNode;
};

/** On/off setting that takes effect at once. */
export function Switch({ label, hint, className, id, ...props }: Props) {
  const generated = useId();
  const controlId = id ?? generated;
  const control = (
    <SwitchPrimitive.Root
      id={controlId}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors duration-[120ms]",
        "border-line-strong bg-paper data-[state=checked]:border-ink data-[state=checked]:bg-ink",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-3 translate-x-[2px] rounded-full bg-line-strong transition-transform duration-[120ms]",
          "data-[state=checked]:translate-x-[16px] data-[state=checked]:bg-paper",
        )}
      />
    </SwitchPrimitive.Root>
  );
  if (!label) return control;
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-px">{control}</span>
      <span className="flex flex-col">
        <label htmlFor={controlId} className="text-14 text-ink">
          {label}
        </label>
        {hint ? <span className="text-13 text-ink-muted">{hint}</span> : null}
      </span>
    </div>
  );
}
