import type { useTranslations } from "next-intl";
import type { RuleAction, RuleCondition, RuleParams, StageKind } from "@/lib/db/schema";

export type RuleStage = { id: string; name: string; kind: StageKind };
export type RuleQuestion = {
  id: string;
  label: string;
  type: "yes_no" | "single_choice" | string;
  options: string[];
};
export type RuleTemplate = {
  id: string;
  name: string;
  kind: string;
  /** Has the slots link: usable to offer interview slots. */
  slotsLink: boolean;
  /** Needs a slot link or an interview date: not usable on its own. */
  scheduling: boolean;
};
export type RulePerson = { id: string; name: string; role: string };

export type RuleShape = {
  delayMinutes: number;
  condition: RuleCondition | null;
  action: RuleAction;
  params: RuleParams;
};

type Lookups = {
  locale: string;
  stages: RuleStage[];
  questions: RuleQuestion[];
  templates: RuleTemplate[];
  team: RulePerson[];
};

type T = ReturnType<typeof useTranslations<"rules">>;

/** « 2 days », « 3 hours » or « at once » from a delay in minutes. */
export function splitDelay(minutes: number): { unit: "now" | "hours" | "days"; amount: number } {
  if (minutes <= 0) return { unit: "now", amount: 1 };
  if (minutes % 1440 === 0) return { unit: "days", amount: minutes / 1440 };
  return { unit: "hours", amount: Math.max(1, Math.round(minutes / 60)) };
}

function names(ids: string[] | undefined, team: RulePerson[], locale: string, t: T) {
  const list = (ids ?? [])
    .map((id) => team.find((p) => p.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (list.length === 0) return t("sentence.nobody");
  return new Intl.ListFormat(locale, { type: "conjunction" }).format(list);
}

/** The rule as one sentence: « Après 2 jours, si … = Non : refuser (…) et envoyer « Refus ». » */
export function ruleSentence(
  rule: RuleShape,
  { locale, stages, questions, templates, team }: Lookups,
  t: T,
  reasonLabel: (reason: string) => string,
) {
  const delay = splitDelay(rule.delayMinutes);
  const when =
    delay.unit === "now" ? t("sentence.now") : t(`sentence.${delay.unit}`, { count: delay.amount });
  let condition = "";
  if (rule.condition) {
    const question = questions.find((q) => q.id === rule.condition!.questionId);
    const answer =
      question?.type === "yes_no"
        ? t(rule.condition.equals === "yes" ? "sentence.yes" : "sentence.no")
        : rule.condition.equals;
    condition = t("sentence.condition", {
      question: question?.label ?? t("sentence.missingQuestion"),
      answer,
    });
  }
  const p = rule.params;
  const template = templates.find((tpl) => tpl.id === p.templateId)?.name;
  const templateName = template ?? t("sentence.missingTemplate");
  let action: string;
  switch (rule.action) {
    case "email":
      action = t("sentence.email", { template: templateName });
      break;
    case "reject":
      action = p.templateId
        ? t("sentence.rejectEmail", {
            reason: reasonLabel(p.reason ?? "other"),
            template: templateName,
          })
        : t("sentence.reject", { reason: reasonLabel(p.reason ?? "other") });
      break;
    case "notify":
      action = p.message
        ? t("sentence.notifyMessage", {
            people: names(p.userIds, team, locale, t),
            message: p.message,
          })
        : t("sentence.notify", { people: names(p.userIds, team, locale, t) });
      break;
    case "tag":
      action = t("sentence.tag", { tag: p.tag ?? "" });
      break;
    case "move":
      action = t("sentence.move", {
        stage: stages.find((s) => s.id === p.stageId)?.name ?? t("sentence.missingStage"),
      });
      break;
    case "propose_slots":
      action = t("sentence.proposeSlots", {
        minutes: p.durationMinutes ?? 0,
        people: names(p.interviewerIds, team, locale, t),
        place: t(`sentence.place.${p.locationKind ?? "video"}`),
        template: templateName,
      });
      break;
  }
  return t("sentence.full", { when, condition, action });
}
