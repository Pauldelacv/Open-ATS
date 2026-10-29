"use client";

import { MoreHorizontal, Plus, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteRuleAction,
  setRuleEnabledAction,
} from "@/app/(app)/(backoffice)/jobs/[jobId]/rules/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import type { RuleRow } from "@/lib/services/automations";
import { RuleEditor } from "./rule-editor";
import {
  ruleSentence,
  type RulePerson,
  type RuleQuestion,
  type RuleStage,
  type RuleTemplate,
} from "./rule-sentence";

const KNOWN_FAILURES = new Set(["template", "slots", "send", "people", "target", "slotsLink"]);

export function RulesView({
  jobId,
  stages,
  rules,
  questions,
  templates,
  team,
  meId,
}: {
  jobId: string;
  stages: RuleStage[];
  rules: RuleRow[];
  questions: RuleQuestion[];
  templates: RuleTemplate[];
  team: RulePerson[];
  meId: string;
}) {
  const t = useTranslations("rules");
  const tr = useTranslations("reject.reasons");
  const tx = loose(useTranslations());
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ rule: RuleRow | null; stageId: string } | null>(null);
  const [deleting, setDeleting] = useState<RuleRow | null>(null);
  const lookups = { locale, stages, questions, templates, team };
  const reasonLabel = (reason: string) => tr(reason as "other");

  const toggle = (rule: RuleRow, enabled: boolean) =>
    start(async () => {
      const result = await setRuleEnabledAction(jobId, rule.id, enabled);
      if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
      toast(enabled ? t("enabledToast") : t("pausedToast"));
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      if (!deleting) return;
      const result = await deleteRuleAction(jobId, deleting.id);
      if (!result.ok) return void toast({ message: tx(result.error), tone: "danger" });
      setDeleting(null);
      toast(t("deletedToast"));
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-2xl">
        <h2 className="text-20 font-semibold">{t("title")}</h2>
        <p className="mt-1 text-14 text-ink-muted">{t("intro")}</p>
      </div>

      {stages.map((stage) => {
        const own = rules.filter((r) => r.stageId === stage.id);
        const headingId = `stage-${stage.id}-heading`;
        return (
          <section
            key={stage.id}
            id={`stage-${stage.id}`}
            aria-labelledby={headingId}
            className="scroll-mt-4 rounded-md border border-line bg-paper"
          >
            <header
              className={cn(
                "flex min-h-11 items-center justify-between gap-3 px-4 py-1.5",
                own.length > 0 && "border-b border-line",
              )}
            >
              <h3
                id={headingId}
                className="flex min-w-0 items-baseline gap-2 text-14 font-semibold"
              >
                <span className="truncate">{stage.name}</span>
                {own.length > 0 ? (
                  <span className="font-normal text-ink-muted tabular-nums">
                    {t("count", { count: own.length })}
                  </span>
                ) : (
                  <span className="text-13 font-normal text-ink-muted">{t("none")}</span>
                )}
              </h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing({ rule: null, stageId: stage.id })}
                aria-label={t("addTo", { stage: stage.name })}
              >
                <Plus aria-hidden="true" />
                {t("add")}
              </Button>
            </header>
            {own.length > 0 ? (
              <ul className="divide-y divide-line px-4">
                {own.map((rule) => {
                  const sentence = ruleSentence(rule, lookups, t, reasonLabel);
                  const failure = rule.lastFailure;
                  return (
                    <li key={rule.id} className="flex items-start gap-3 py-3">
                      <Zap
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          rule.enabled ? "text-ink" : "text-ink-subtle",
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-14", !rule.enabled && "text-ink-muted")}>
                          {sentence}
                        </p>
                        <p className="mt-0.5 text-13 text-ink-muted tabular-nums">
                          {!rule.enabled ? (
                            <span className="font-medium">{t("paused")} · </span>
                          ) : null}
                          {rule.done > 0 ? t("done", { count: rule.done }) : t("notYet")}
                          {rule.pending > 0 ? (
                            <> · {t("pending", { count: rule.pending })}</>
                          ) : null}
                          {rule.lastDoneAt ? (
                            <>
                              {" "}
                              · {t("lastDone", { date: formatRelative(rule.lastDoneAt, locale) })}
                            </>
                          ) : null}
                        </p>
                        {failure ? (
                          <p className="mt-0.5 text-13 text-danger">
                            {t("failed", {
                              count: rule.failed,
                              date: failure.at ? formatRelative(failure.at, locale) : "",
                              reason: tx(
                                `rules.failures.${KNOWN_FAILURES.has(failure.reason ?? "") ? failure.reason : "other"}`,
                              ),
                            })}
                          </p>
                        ) : null}
                      </div>
                      <Switch
                        checked={rule.enabled}
                        disabled={pending}
                        onCheckedChange={(value) => toggle(rule, value)}
                        aria-label={t("toggle", { rule: sentence })}
                        className="mt-0.5"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            className="-my-1 w-8 shrink-0 px-0"
                            aria-label={t("actions")}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setEditing({ rule, stageId: rule.stageId })}
                          >
                            {t("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem tone="danger" onSelect={() => setDeleting(rule)}>
                            {t("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}

      {editing ? (
        <RuleEditor
          key={editing.rule?.id ?? `new-${editing.stageId}`}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          jobId={jobId}
          rule={editing.rule}
          stageId={editing.stageId}
          lookups={lookups}
          meId={meId}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        {deleting ? (
          <DialogContent width="sm" title={t("deleteTitle")} closeLabel={tx("common.close")}>
            <DialogBody className="flex flex-col gap-2">
              <p className="text-14">{ruleSentence(deleting, lookups, t, reasonLabel)}</p>
              <p className="text-14 text-ink-muted">{t("deleteBody")}</p>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{tx("common.cancel")}</Button>
              </DialogClose>
              <Button variant="danger" loading={pending} onClick={remove}>
                {t("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
