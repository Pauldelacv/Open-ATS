"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type FieldProps = {
  label: ReactNode;
  /** Shown after the label, e.g. « (facultatif) ». */
  qualifier?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  size?: "md" | "lg";
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
};

/** Label, control, hint and error wired together with ids and ARIA attributes. */
export function Field({ label, qualifier, hint, error, className, size = "md", children }: FieldProps) {
  const autoId = useId();
  const id = (isValidElement(children) && children.props.id) || autoId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("font-medium text-ink", size === "lg" ? "text-14" : "text-13")}>
        {label}
        {qualifier ? <span className="font-normal text-ink-muted"> {qualifier}</span> : null}
      </label>
      {cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && !error ? (
        <p id={hintId} className="text-13 text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-13 text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Fieldset({
  legend,
  hint,
  error,
  children,
  className,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <fieldset className={cn("flex flex-col gap-2", className)} aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1.5 text-13 font-medium text-ink">{legend}</legend>
      {hint ? <p className="-mt-1 text-13 text-ink-muted">{hint}</p> : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-13 text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
