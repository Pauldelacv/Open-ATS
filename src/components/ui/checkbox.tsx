import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: ReactNode; hint?: ReactNode };

const box = [
  "peer relative size-4 shrink-0 appearance-none rounded-xs border border-ink bg-paper",
  "transition-colors duration-[120ms]",
  "checked:border-cobalt checked:bg-cobalt",
  "indeterminate:border-cobalt indeterminate:bg-cobalt",
  "disabled:cursor-not-allowed disabled:border-line-strong disabled:bg-stone",
  "aria-invalid:border-danger",
].join(" ");

export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { className, label, hint, id, ...props },
  ref,
) {
  const control = (
    <span className="relative inline-flex size-4 shrink-0">
      <input ref={ref} id={id} type="checkbox" className={box} {...props} />
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden size-4 text-paper peer-checked:block"
      >
        <path d="M4 8.5 6.8 11 12 5.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden size-4 text-paper peer-indeterminate:block"
      >
        <path d="M4.5 8h7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </span>
  );
  if (!label) return <span className={className}>{control}</span>;
  return (
    <label htmlFor={id} className={cn("flex items-start gap-2.5 text-14", props.disabled && "text-ink-subtle", className)}>
      <span className="mt-0.5">{control}</span>
      <span>
        {label}
        {hint ? <span className="mt-0.5 block text-13 text-ink-muted">{hint}</span> : null}
      </span>
    </label>
  );
});

export const Radio = forwardRef<HTMLInputElement, Props>(function Radio(
  { className, label, id, ...props },
  ref,
) {
  return (
    <label htmlFor={id} className={cn("flex items-center gap-2.5 text-14", props.disabled && "text-ink-subtle", className)}>
      <input
        ref={ref}
        id={id}
        type="radio"
        className={cn(
          "size-4 shrink-0 appearance-none rounded-full border border-ink bg-paper",
          "transition-[border-width,border-color] duration-[120ms]",
          "checked:border-[5px] checked:border-cobalt",
          "disabled:border-line-strong disabled:bg-stone",
        )}
        {...props}
      />
      {label}
    </label>
  );
});
