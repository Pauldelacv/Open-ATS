import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium",
    "transition-colors duration-[120ms] ease-out select-none",
    "disabled:pointer-events-none aria-disabled:pointer-events-none aria-busy:opacity-80",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-cobalt text-paper hover:bg-cobalt-hover active:bg-cobalt-press disabled:bg-stone-strong disabled:text-ink-subtle",
        brand:
          "bg-brand text-brand-fg hover:bg-brand-hover disabled:bg-stone-strong disabled:text-ink-subtle",
        secondary:
          "border border-line-strong bg-paper text-ink hover:bg-stone active:bg-stone-strong disabled:border-line disabled:text-ink-subtle",
        ghost: "text-ink hover:bg-stone-strong/70 active:bg-stone-strong disabled:text-ink-subtle",
        danger:
          "bg-danger text-paper hover:bg-danger-hover active:bg-danger-press disabled:bg-stone-strong disabled:text-ink-subtle",
        link: "h-auto px-0 text-cobalt underline-offset-2 hover:underline disabled:text-ink-subtle",
      },
      size: {
        sm: "h-7 px-2.5 text-13",
        md: "h-8 px-3 text-14",
        lg: "h-10 px-4 text-16",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, disabled, children, type, ...props },
  ref,
) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner /> : null}
          {children}
        </>
      )}
    </Component>
  );
});
