"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveRuleAction } from "@/app/(app)/(backoffice)/jobs/[jobId]/rules/actions";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, Fieldset } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { loose } from "@/i18n/loose";
import type { LocationKind, RuleAction, RuleParams } from "@/lib/db/schema";
import type { RuleRow } from "@/lib/services/automations";
import { rejectionReasons } from "@/lib/services/rejection-reasons";
import {
  ruleSentence,
  splitDelay,
  type RulePerson,
  type RuleQuestion,
  type RuleStage,
  type RuleTemplate,
} from "./rule-sentence";

const ACTIONS: RuleAction[] = ["email", "reject", "notify", "tag", "move", "propose_slots"];
const DURATIONS = [30, 45, 60, 90];
const PLACES: LocationKind[] = ["video", "onsite", "phone"];
const MAX_DAYS = 90;

type Lookups = {
  locale: string;
  stages: RuleStage[];
  questions: RuleQuestion[];
  templates: RuleTemplate[];
  team: RulePerson[];
};

function TeamChecklist({
  team,
  value,
  onChange,
}: {
  team: RulePerson[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {team.map((person) => (
        <Checkbox
          key={person.id}
          label={person.name}
          checked={value.includes(person.id)}
          onChange={(e) =>
            onChange(
              e.target.checked ? [...value, person.id] : value.filter((id) => id !== person.id),
            )
          }
        />
      ))}
    </div>
  );
}

export function RuleEditor({
  open,
  onOpenChange,
  jobId,
  rule,
  stageId: initialStageId,
  lookups,
  meId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  rule: RuleRow | null;
  stageId: string;
  lookups: Lookups;
  meId: string;
  onSaved: () => void;
}) {
  const t = useTranslations("rules");
  const te = useTranslations("rules.editor");
  const tr = useTranslations("reject.reasons");
  const tx = loose(useTranslations());
  const { stages, questions, templates, team } = lookups;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const p = rule?.params ?? {};
  // Emails sent on their own cannot fill a slot link or an interview date.
  const plainTemplates = templates.filter((tpl) => !tpl.scheduling);
  const firstOf = (kind: string) => plainTemplates.find((tpl) => tpl.kind === kind)?.id ?? "";
  const slotTemplates = templates.filter((tpl) => tpl.slotsLink);
  const initialDelay = splitDelay(rule?.delayMinutes ?? 0);

  const [stageId, setStageId] = useState(rule?.stageId ?? initialStageId);
  const [delayUnit, setDelayUnit] = useState(initialDelay.unit);
  const [delayAmount, setDelayAmount] = useState(String(initialDelay.amount));
  const [conditional, setConditional] = useState(Boolean(rule?.condition));
  const [questionId, setQuestionId] = useState(
    rule?.condition?.questionId ?? questions[0]?.id ?? "",
  );
  const [equals, setEquals] = useState(rule?.condition?.equals ?? "");
  const [action, setAction] = useState<RuleAction>(rule?.action ?? "email");
  const [emailTemplate, setEmailTemplate] = useState(
    (rule?.action === "email" && p.templateId) || plainTemplates[0]?.id || "",
  );
  const [reason, setReason] = useState(p.reason ?? "profile_mismatch");
  const [rejectEmail, setRejectEmail] = useState(rule ? Boolean(p.templateId) : true);
  const [rejectTemplate, setRejectTemplate] = useState(
    (rule?.action === "reject" && p.templateId) || firstOf("rejection"),
  );
  const [userIds, setUserIds] = useState<string[]>(p.userIds ?? [meId]);
  const [message, setMessage] = useState(p.message ?? "");
  const [tag, setTag] = useState(p.tag ?? "");
  const stage = stages.find((s) => s.id === stageId);
  const targets = stages.filter((s) => s.id !== stageId && s.kind !== "rejected");
  const [moveTo, setMoveTo] = useState(p.stageId ?? "");
  const [interviewers, setInterviewers] = useState<string[]>(p.interviewerIds ?? [meId]);
  const [duration, setDuration] = useState(p.durationMinutes ?? 45);
  const [place, setPlace] = useState<LocationKind>(p.locationKind ?? "video");
  const [location, setLocation] = useState(p.location ?? "");
  const [slotsTemplate, setSlotsTemplate] = useState(
    (rule?.action === "propose_slots" && p.templateId) || slotTemplates[0]?.id || "",
  );

  const question = questions.find((q) => q.id === questionId);
  const answers =
    question?.type === "yes_no"
      ? [
          { value: "yes", label: t("sentence.yes") },
          { value: "no", label: t("sentence.no") },
        ]
      : (question?.options ?? []).map((o) => ({ value: o, label: o }));
  const answer = answers.some((a) => a.value === equals) ? equals : (answers[0]?.value ?? "");
  const actions = ACTIONS.filter(
    (a) => !(stage?.kind === "rejected" && (a === "reject" || a === "propose_slots")),
  );
  const currentAction = actions.includes(action) ? action : actions[0]!;
  const target = targets.some((s) => s.id === moveTo) ? moveTo : (targets[0]?.id ?? "");

  const amount = Number(delayAmount);
  const delayMinutes =
    delayUnit === "now" ? 0 : delayUnit === "hours" ? amount * 60 : amount * 1440;
  const delayValid =
    delayUnit === "now" ||
    (Number.isInteger(amount) && amount >= 1 && delayMinutes <= MAX_DAYS * 1440);

  const params = (): RuleParams => {
    switch (currentAction) {
      case "email":
        return { templateId: emailTemplate || null };
      case "reject":
        return { reason, templateId: rejectEmail ? rejectTemplate || null : null };
      case "notify":
        return { userIds, message: message.trim() };
      case "tag":
        return { tag: tag.trim() };
      case "move":
        return { stageId: target };
      case "propose_slots":
        return {
          interviewerIds: interviewers,
          durationMinutes: duration,
          locationKind: place,
          location: location.trim() || null,
          templateId: slotsTemplate || null,
        };
    }
  };

  const draft = {
    delayMinutes: delayValid ? delayMinutes : 0,
    condition: conditional && question ? { questionId: question.id, equals: answer } : null,
    action: currentAction,
    params: params(),
  };

  const localError = (): string | null => {
    if (!delayValid) return "rules.errors.delay";
    if (conditional && (!question || !answer)) return "rules.errors.condition";
    const d = draft.params;
    if (currentAction === "email" && !d.templateId) return "rules.errors.template";
    if (currentAction === "reject" && rejectEmail && !d.templateId) return "rules.errors.template";
    if (currentAction === "notify" && userIds.length === 0) return "rules.errors.people";
    if (currentAction === "tag" && !d.tag) return "rules.errors.tag";
    if (currentAction === "move" && !d.stageId) return "rules.errors.target";
    if (currentAction === "propose_slots") {
      if (interviewers.length === 0) return "rules.errors.people";
      if (!d.templateId) return "rules.errors.slotsLink";
    }
    return null;
  };

  const save = () => {
    const problem = localError();
    if (problem) return setError(problem);
    setError(null);
    start(async () => {
      const result = await saveRuleAction(jobId, rule?.id ?? null, { stageId, ...draft });
      if (!result.ok) return void setError(result.error);
      toast(rule ? t("savedToast") : t("createdToast"));
      onSaved();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        width="lg"
        title={rule ? te("editTitle") : te("newTitle")}
        description={te("description")}
        closeLabel={tx("common.close")}
      >
        <form
          noValidate
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <DialogBody className="flex flex-col gap-5">
            <Field label={te("stage")}>
              <Select value={stageId} onChange={(e) => setStageId(e.target.value)}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Fieldset legend={te("when")} hint={te("whenHint")}>
              <div className="flex flex-col gap-2">
                <Radio
                  name="rule-delay"
                  checked={delayUnit === "now"}
                  onChange={() => setDelayUnit("now")}
                  label={te("now")}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Radio
                    name="rule-delay"
                    checked={delayUnit !== "now"}
                    onChange={() => setDelayUnit("days")}
                    label={te("after")}
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={delayUnit === "hours" ? MAX_DAYS * 24 : MAX_DAYS}
                    value={delayAmount}
                    aria-label={te("amount")}
                    aria-invalid={!delayValid || undefined}
                    onFocus={() => delayUnit === "now" && setDelayUnit("days")}
                    onChange={(e) => setDelayAmount(e.target.value)}
                    className="w-20 tabular-nums"
                  />
                  <Select
                    value={delayUnit === "now" ? "days" : delayUnit}
                    aria-label={te("unit")}
                    onChange={(e) => setDelayUnit(e.target.value as "hours" | "days")}
                    className="w-32"
                  >
                    <option value="hours">{te("hours", { count: amount || 2 })}</option>
                    <option value="days">{te("days", { count: amount || 2 })}</option>
                  </Select>
                </div>
              </div>
            </Fieldset>

            <Fieldset
              legend={te("condition")}
              hint={questions.length === 0 ? te("noQuestions") : undefined}
            >
              <Radio
                name="rule-condition"
                checked={!conditional}
                onChange={() => setConditional(false)}
                label={te("always")}
              />
              <Radio
                name="rule-condition"
                checked={conditional}
                disabled={questions.length === 0}
                onChange={() => setConditional(true)}
                label={te("onlyIf")}
              />
              {conditional && questions.length > 0 ? (
                <div className="grid gap-3 pl-6 sm:grid-cols-[minmax(0,1fr)_160px]">
                  <Field label={te("question")}>
                    <Select value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
                      {questions.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={te("answer")}>
                    <Select value={answer} onChange={(e) => setEquals(e.target.value)}>
                      {answers.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}
            </Fieldset>

            <div className="flex flex-col gap-4 border-t border-line pt-5">
              <Field label={te("action")}>
                <Select
                  value={currentAction}
                  onChange={(e) => setAction(e.target.value as RuleAction)}
                >
                  {actions.map((a) => (
                    <option key={a} value={a}>
                      {te(`actions.${a}`)}
                    </option>
                  ))}
                </Select>
              </Field>

              {currentAction === "email" ? (
                <Field label={te("template")}>
                  <Select value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)}>
                    {plainTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {currentAction === "reject" ? (
                <>
                  <Field label={te("reason")} hint={te("reasonHint")}>
                    <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                      {rejectionReasons.map((r) => (
                        <option key={r} value={r}>
                          {tr(r)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Checkbox
                    checked={rejectEmail}
                    onChange={(e) => setRejectEmail(e.target.checked)}
                    label={te("rejectEmail")}
                  />
                  {rejectEmail ? (
                    <Field label={te("template")} className="pl-6">
                      <Select
                        value={rejectTemplate}
                        onChange={(e) => setRejectTemplate(e.target.value)}
                      >
                        {plainTemplates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                </>
              ) : null}

              {currentAction === "notify" ? (
                <>
                  <Fieldset legend={te("people")}>
                    <TeamChecklist team={team} value={userIds} onChange={setUserIds} />
                  </Fieldset>
                  <Field
                    label={te("message")}
                    qualifier={tx("common.optional")}
                    hint={te("messageHint")}
                  >
                    <Textarea
                      rows={2}
                      maxLength={300}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </Field>
                </>
              ) : null}

              {currentAction === "tag" ? (
                <Field label={te("tag")}>
                  <Input maxLength={40} value={tag} onChange={(e) => setTag(e.target.value)} />
                </Field>
              ) : null}

              {currentAction === "move" ? (
                <Field label={te("target")}>
                  <Select value={target} onChange={(e) => setMoveTo(e.target.value)}>
                    {targets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}

              {currentAction === "propose_slots" ? (
                <>
                  <p className="text-13 text-ink-muted">{te("slotsHint")}</p>
                  <Fieldset legend={te("interviewers")}>
                    <TeamChecklist team={team} value={interviewers} onChange={setInterviewers} />
                  </Fieldset>
                  <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
                    <Field label={te("duration")}>
                      <Select
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                      >
                        {DURATIONS.map((d) => (
                          <option key={d} value={d}>
                            {te("minutes", { count: d })}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Fieldset legend={te("place")}>
                      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1.5">
                        {PLACES.map((k) => (
                          <Radio
                            key={k}
                            name="rule-place"
                            checked={place === k}
                            onChange={() => setPlace(k)}
                            label={tx(`interviews.dialog.${k}`)}
                          />
                        ))}
                      </div>
                    </Fieldset>
                  </div>
                  <Field
                    label={te(`location.${place}`)}
                    qualifier={tx("common.optional")}
                    hint={place === "video" ? te("videoHint") : undefined}
                  >
                    <Input
                      value={location}
                      inputMode={place === "video" ? "url" : undefined}
                      placeholder={place === "video" ? "https://" : undefined}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </Field>
                  <Field label={te("template")} hint={te("slotsTemplateHint")}>
                    <Select
                      value={slotsTemplate}
                      onChange={(e) => setSlotsTemplate(e.target.value)}
                    >
                      {slotTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : null}
            </div>

            <div className="rounded-sm bg-stone px-3 py-2.5" aria-live="polite">
              <p className="text-13 font-medium text-ink-muted">{te("summary")}</p>
              <p className="mt-0.5 text-14 text-ink">
                {ruleSentence(draft, lookups, t, (r) => tr(r as "other"))}
              </p>
            </div>

            {error ? <Banner tone="danger">{tx(error)}</Banner> : null}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{tx("common.cancel")}</Button>
            </DialogClose>
            <Button type="submit" variant="primary" loading={pending}>
              {rule ? te("save") : te("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
