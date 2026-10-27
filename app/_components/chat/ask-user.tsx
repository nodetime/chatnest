"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/app/_components/ui/button";
import { Textarea } from "@/app/_components/ui/textarea";
import {
  type AskUserOutput,
  type AskUserPart,
  askUserInputSchema,
  validateAskUserOutput,
} from "@/server/domain/message/agent-interactions";

export type AnswerAskUser = (response: {
  messageId: string;
  toolCallId: string;
  output: AskUserOutput;
}) => Promise<void>;
export type AskUserProps = {
  messageId: string;
  part: AskUserPart;
  onAnswer: AnswerAskUser;
  onRevise?: AnswerAskUser;
  isReadonly?: boolean;
  canAnswer?: boolean;
  isRunning?: boolean;
};

export function AskUser({
  messageId,
  part,
  onAnswer,
  onRevise,
  isReadonly = false,
  canAnswer = true,
  isRunning = false,
}: AskUserProps) {
  const formId = useId();
  const identity = `${messageId}:${part.toolCallId}`;
  const current = useRef({ identity, pending: false });
  if (current.current.identity !== identity) {
    current.current = { identity, pending: false };
  }
  const [draft, setDraft] = useState<{
    identity: string;
    answers: AskUserOutput["answers"];
  }>({ answers: {}, identity });
  const [mode, setMode] = useState({
    collapsed: false,
    identity,
    revising: false,
  });
  const collapsed = mode.identity === identity && mode.collapsed;
  const revising = mode.identity === identity && mode.revising;
  const [submission, setSubmission] = useState({
    error: "",
    identity,
    pending: false,
  });
  const answers = draft.identity === identity ? draft.answers : {};
  const parsed = askUserInputSchema.safeParse(part.input);
  const pending = submission.identity === identity && submission.pending;
  const error = submission.identity === identity ? submission.error : "";
  const available = !isReadonly && canAnswer && !isRunning;
  const submit = useCallback(
    async (value: AskUserOutput) => {
      if (
        !available ||
        current.current.identity !== identity ||
        current.current.pending
      ) {
        return;
      }
      let output: AskUserOutput;
      try {
        output = validateAskUserOutput(part.input, value);
      } catch {
        setSubmission({
          error: "请填写必填项，并核对所选内容。",
          identity,
          pending: false,
        });
        return;
      }
      const request = current.current;
      request.pending = true;
      setSubmission({ error: "", identity, pending: true });
      try {
        const handler = revising && onRevise ? onRevise : onAnswer;
        await handler({ messageId, output, toolCallId: part.toolCallId });
        if (current.current === request) {
          if (revising) {
            request.pending = false;
            setMode({ collapsed: false, identity, revising: false });
          }
          setSubmission({ error: "", identity, pending: false });
        }
      } catch {
        if (current.current === request) {
          request.pending = false;
          setSubmission({
            error: "回答尚未确认提交，请重试。已保存的回答会保留。",
            identity,
            pending: false,
          });
        }
      }
    },
    [
      available,
      identity,
      messageId,
      onAnswer,
      onRevise,
      part.input,
      part.toolCallId,
      revising,
    ]
  );
  const input = parsed.success ? parsed.data : null;
  const completed = part.state === "output-available";
  const output = completed ? part.output : undefined;
  const handleResume = useCallback(
    () => setMode({ collapsed: false, identity, revising }),
    [identity, revising]
  );
  const handleDefer = useCallback(
    () => setMode({ collapsed: true, identity, revising }),
    [identity, revising]
  );
  const handleCancelRevision = useCallback(
    () => setMode({ collapsed: false, identity, revising: false }),
    [identity]
  );
  const handleSkip = useCallback(
    () => submit({ answers: {}, status: "cancelled" }),
    [submit]
  );
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      return submit({ answers, status: "answered" });
    },
    [answers, submit]
  );
  const handleRevise = useCallback(() => {
    current.current.pending = false;
    setDraft({ answers: output?.answers ?? {}, identity });
    setMode({ collapsed: false, identity, revising: true });
  }, [identity, output]);
  const handleRetry = useCallback(
    () => (output ? submit(output) : undefined),
    [output, submit]
  );
  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const field = event.target;
      const { questionId } = field.dataset;
      if (!questionId) {
        return;
      }
      const isMulti = field.dataset.questionType === "multi";
      const checked = "checked" in field && field.checked;
      setDraft((previous) => {
        const previousAnswers =
          previous.identity === identity ? previous.answers : {};
        const old = previousAnswers[questionId];
        const selected = Array.isArray(old) ? old : [];
        const next = isMulti
          ? checked
            ? [...new Set([...selected, field.value])]
            : selected.filter((item) => item !== field.value)
          : field.value;
        return {
          answers: { ...previousAnswers, [questionId]: next },
          identity,
        };
      });
    },
    [identity]
  );

  if (!input) {
    return (
      <div
        className="rounded-xl border p-4 text-sm text-muted-foreground"
        role="status"
      >
        {part.state === "input-streaming"
          ? "正在整理需要你确认的问题…"
          : "提问未完成，请让 Agent 继续处理。"}
      </div>
    );
  }
  return (
    <section
      aria-label="Agent 提问"
      className="w-full rounded-xl border border-border bg-muted/20 p-4 sm:p-5"
      data-testid="ask-user"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-foreground/60" />
        <h3 className="text-sm font-medium text-foreground">{input.title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {completed
            ? output?.status === "cancelled"
              ? "已跳过"
              : "已回答"
            : "等待你的回答"}
        </span>
      </div>
      {collapsed && available ? (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>草稿已保留，稍后可继续回答。</span>
          <Button
            onClick={handleResume}
            size="sm"
            type="button"
            variant="outline"
          >
            继续回答
          </Button>
        </div>
      ) : (completed && !revising) || !available ? (
        <dl className="space-y-3 text-sm">
          {input.questions.map((question) => {
            const value = output?.answers[question.id];
            const values = Array.isArray(value)
              ? value
              : typeof value === "string"
                ? [value]
                : [];
            const labels = values.map(
              (item) =>
                question.options?.find((option) => option.value === item)
                  ?.label ?? item
            );
            return (
              <div key={question.id}>
                <dt className="text-xs text-muted-foreground">
                  {question.label}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words">
                  {labels.join("、") ||
                    (output?.status === "cancelled"
                      ? "已跳过这次提问"
                      : "尚未回答")}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <form
          aria-describedby={error ? `${formId}-error` : undefined}
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          {input.questions.map((question) => (
            <fieldset
              className="space-y-2"
              disabled={pending}
              key={question.id}
            >
              <legend
                className="mb-2 text-[13px] font-medium"
                id={`${formId}-${question.id}-label`}
              >
                {question.label}
                {!!question.required && (
                  <span aria-hidden className="ml-1 text-muted-foreground">
                    *
                  </span>
                )}
              </legend>
              {question.type === "text" ? (
                <Textarea
                  aria-labelledby={`${formId}-${question.id}-label`}
                  className="min-h-20 w-full resize-y rounded-lg border border-border bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-question-id={question.id}
                  data-question-type={question.type}
                  maxLength={4000}
                  onChange={handleInputChange}
                  required={question.required}
                  value={
                    typeof answers[question.id] === "string"
                      ? (answers[question.id] as string)
                      : ""
                  }
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {question.options?.map((option) => {
                    const value = answers[question.id];
                    const selected =
                      question.type === "multi"
                        ? Array.isArray(value) && value.includes(option.value)
                        : value === option.value;
                    return (
                      <label
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors ${selected ? "border-foreground/40 bg-accent" : "border-border bg-background hover:bg-accent/50"}`}
                        key={option.value}
                      >
                        <input
                          checked={selected}
                          className="accent-foreground"
                          data-question-id={question.id}
                          data-question-type={question.type}
                          name={`${formId}-${question.id}`}
                          onChange={handleInputChange}
                          required={
                            question.type === "single" && question.required
                          }
                          type={
                            question.type === "multi" ? "checkbox" : "radio"
                          }
                          value={option.value}
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              disabled={pending}
              onClick={handleDefer}
              size="sm"
              type="button"
              variant="ghost"
            >
              稍后回答
            </Button>
            {revising ? (
              <Button
                disabled={pending}
                onClick={handleCancelRevision}
                size="sm"
                type="button"
                variant="ghost"
              >
                取消修改
              </Button>
            ) : (
              <Button
                disabled={pending}
                onClick={handleSkip}
                size="sm"
                type="button"
                variant="ghost"
              >
                跳过
              </Button>
            )}
            <Button disabled={pending} size="sm" type="submit">
              {pending
                ? "正在提交…"
                : revising
                  ? "提交修改并继续"
                  : "确认并继续"}
            </Button>
          </div>
        </form>
      )}
      {completed &&
        !collapsed &&
        !revising &&
        available &&
        onRevise &&
        !pending && (
          <Button
            className="mt-3"
            onClick={handleRevise}
            size="sm"
            type="button"
            variant="outline"
          >
            修改回答
          </Button>
        )}
      {!!pending && !!completed && (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          正在保存并继续…
        </p>
      )}
      {!!error && (
        <div
          className="mt-3 text-xs text-destructive"
          id={`${formId}-error`}
          role="alert"
        >
          {error}
          {!!completed && !!available && !!output && (
            <Button
              className="ml-2"
              onClick={handleRetry}
              size="xs"
              type="button"
              variant="link"
            >
              重试提交
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
