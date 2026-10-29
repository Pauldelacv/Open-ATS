import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  info: { box: "border-line bg-paper", icon: Info, iconClass: "text-cobalt" },
  warning: {
    box: "border-warning/30 bg-warning-tint",
    icon: TriangleAlert,
    iconClass: "text-warning",
  },
  danger: { box: "border-danger/30 bg-danger-tint", icon: CircleAlert, iconClass: "text-danger" },
} as const;

export function Banner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-14",
        t.box,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children ? (
          <div className={cn("text-ink", title && "mt-0.5 text-ink-muted")}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
