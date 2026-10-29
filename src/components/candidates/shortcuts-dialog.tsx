"use client";

import { useTranslations } from "next-intl";
import { Dialog, DialogBody, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("panel.shortcuts");
  const tc = useTranslations("common");
  const rows: Array<[string[], string]> = [
    [["J"], t("next")],
    [["K"], t("previous")],
    [["1", "…", "5"], t("rate")],
    [["E"], t("email")],
    [["R"], t("reject")],
    [["P"], t("schedule")],
    [["Esc"], t("close")],
    [["X"], t("select")],
    [["Ctrl", "K"], t("palette")],
    [["?"], t("help")],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="sm" title={t("title")} closeLabel={tc("close")}>
        <DialogBody>
          <dl className="flex flex-col divide-y divide-line">
            {rows.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-2">
                <dt className="text-14">{label}</dt>
                <dd className="flex gap-1">
                  {keys.map((k) =>
                    k === "…" ? (
                      <span key={k} className="text-ink-muted">
                        …
                      </span>
                    ) : (
                      <Kbd key={k}>{k}</Kbd>
                    ),
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
