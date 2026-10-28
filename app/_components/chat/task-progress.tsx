"use client";

import {
  CheckIcon,
  ChevronDown,
  CircleIcon,
  ListTodo,
  Loader2Icon,
} from "lucide-react";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/app/_components/ai-elements/task";
import { Button } from "@/app/_components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/_components/ui/popover";
import type { TodoPlan } from "@/server/domain/message/agent-interactions";

export type TaskProgressProps = { plan: TodoPlan | null; compact?: boolean };

/** 展示真实 updateTodo 结果；不把普通模型文本转换成完成状态。 */
export function TaskProgress({ plan, compact = false }: TaskProgressProps) {
  if (!plan?.items.length) {
    return null;
  }
  const completed = plan.items.filter(
    (item) => item.status === "completed"
  ).length;
  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            aria-label={`任务进度 ${completed} / ${plan.items.length}`}
            data-testid="task-progress"
            size="sm"
            type="button"
            variant="ghost"
          >
            <ListTodo aria-hidden className="size-3.5 shrink-0" />
            任务进度{" "}
            <span className="text-muted-foreground">
              {completed} / {plan.items.length}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="rounded-xl border-border/80 p-4 w-80 max-w-[calc(100vw-2rem)] max-h-[min(60dvh,420px)] overflow-y-auto"
          side="bottom"
        >
          <TaskProgress plan={plan} />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Task className="w-full" data-testid="task-progress" defaultOpen={!compact}>
      <TaskTrigger
        className="w-full justify-between text-[13px] font-medium text-foreground"
        title={`任务进度 ${completed} / ${plan.items.length}`}
      >
        <ListTodo aria-hidden className="size-4 shrink-0" />
        <span>
          任务进度 {completed} / {plan.items.length}
        </span>
        <ChevronDown
          aria-hidden
          className="ml-auto size-3.5 transition-transform group-data-[state=open]:rotate-180"
        />
      </TaskTrigger>
      <TaskContent className="pt-3">
        <ol className="space-y-3">
          {plan.items.map((item) => {
            const Icon =
              item.status === "completed"
                ? CheckIcon
                : item.status === "in_progress"
                  ? Loader2Icon
                  : CircleIcon;
            const label =
              item.status === "completed"
                ? "已完成"
                : item.status === "in_progress"
                  ? "进行中"
                  : "待处理";
            return (
              <li data-status={item.status} key={item.id}>
                <TaskItem className="flex min-w-0 items-start gap-2.5">
                  <Icon
                    aria-hidden
                    className={`mt-0.5 size-3.5 shrink-0 ${item.status === "in_progress" ? "text-foreground" : ""}`}
                  />
                  <span
                    className={`min-w-0 break-words ${
                      item.status === "completed"
                        ? "line-through opacity-65"
                        : item.status === "in_progress"
                          ? "text-foreground"
                          : ""
                    }`}
                  >
                    {item.title}
                  </span>
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
