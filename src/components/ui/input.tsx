import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export const controlBase = [
  "w-full rounded-sm border border-line-strong bg-paper text-ink",
  "transition-colors duration-[120ms]",
  "hover:border-ink-muted",
  "focus-visible:border-cobalt focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-cobalt",
  "disabled:cursor-not-allowed disabled:border-line disabled:bg-stone disabled:text-ink-subtle",
  "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
].join(" ");

type ControlSize = "md" | "lg";

const sizes: Record<ControlSize, string> = {
  md: "h-8 px-2.5 text-14",
  lg: "h-10 px-3 text-16",
};

export const Input = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: ControlSize }
>(function Input({ className, size = "md", ...props }, ref) {
  return <input ref={ref} className={cn(controlBase, sizes[size], className)} {...props} />;
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { size?: ControlSize }
>(function Textarea({ className, size = "md", rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        controlBase,
        size === "lg" ? "px-3 py-2 text-16" : "px-2.5 py-1.5 text-14",
        "min-h-16 resize-y",
        className,
      )}
      {...props}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: ControlSize }
>(function Select({ className, size = "md", children, ...props }, ref) {
  return (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        className={cn(controlBase, sizes[size], "appearance-none pr-8")}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
});
