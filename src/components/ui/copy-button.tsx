"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, type ButtonProps } from "./button";

/** Copies `value`; the label turns into `copiedLabel` for two seconds. */
export function CopyButton({
  value,
  label,
  copiedLabel,
  ...props
}: Omit<ButtonProps, "onClick" | "children"> & {
  value: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      {...props}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  );
}
