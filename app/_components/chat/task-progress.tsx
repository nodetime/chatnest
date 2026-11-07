"use client";

import {
  CheckIcon,
  ChevronDown,
  CircleIcon,
  ListTodo,
  Loader2Icon,
} from "lucide-react";
import { useState } from "react";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/app/_components/ai-elements/task";
import type { TodoPlan } from "@/server/domain/message/agent-interactions";

export type TaskProgressProps = { plan: TodoPlan | null; isRunning?: boolean };

/** 唯一计划快照直接展示在输入区；展开仅改变视图，不触发执行。 */
export function TaskProgress({ plan, isRunning = false }: TaskProgressProps) {
  const [expanded, setExpanded] = useState<boolean | null>(null);
  if (!plan?.items.length) {
    return null;
  }
  const completed = plan.items.filter(
    (item) => item.status === "completed"
  ).length;
  const done = completed === plan.items.length;
  const current =
    plan.items.find((item) => item.status === "in_progress") ??
    plan.items.find((item) => item.status === "pending");
  const SummaryIcon = isRunning ? Loader2Icon : done ? CheckIcon : ListTodo;
  return (
    <Task
      className="mb-2 rounded-xl border border-border/70 bg-card/60"
      data-testid="task-progress"
      onOpenChange={setExpanded}
      open={expanded ?? !done}
    >
      <TaskTrigger
        aria-label={`任务进度 ${completed} / ${plan.items.length}`}
        className="w-full gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-ring"
      >
        <SummaryIcon
          aria-hidden
          className={`size-3.5 shrink-0 ${isRunning ? "motion-safe:animate-spin" : ""}`}
        />
        <span
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-foreground"
        >
          {done ? (isRunning ? "正在整理结果" : "任务已完成") : current?.title}
        </span>
        {!done && !isRunning && (
          <span className="shrink-0 text-xs text-muted-foreground">待继续</span>
        )}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {completed} / {plan.items.length}
        </span>
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        />
      </TaskTrigger>
      <TaskContent className="max-h-[min(32dvh,240px)] overflow-y-auto px-3.5 pb-3">
        <ol className="space-y-2.5 border-t border-border/50 pt-3">
          {plan.items.map((item) => {
            const Icon =
              item.status === "completed"
                ? CheckIcon
                : item.status === "in_progress" && isRunning
                  ? Loader2Icon
                  : CircleIcon;
            const label =
              item.status === "completed"
                ? "已完成"
                : item.status === "in_progress"
                  ? isRunning
                    ? "进行中"
                    : "待继续"
                  : "待处理";
            return (
              <li data-status={item.status} key={item.id}>
                <TaskItem
                  className={`flex min-w-0 items-start gap-2.5 text-[13px] leading-5 ${item.status === "in_progress" ? "text-foreground" : "text-muted-foreground"}`}
                >
                  <Icon
                    aria-hidden
                    className={`mt-1 size-3.5 shrink-0 ${item.status === "in_progress" && isRunning ? "motion-safe:animate-spin" : ""}`}
                  />
                  <span className="min-w-0 break-words">{item.title}</span>
                  <span className="sr-only">{label}</span>
                </TaskItem>
              </li>
            );
          })}
        </ol>
      </TaskContent>
    </Task>
  );
}
