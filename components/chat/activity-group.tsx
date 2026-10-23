"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Check, ChevronRight, Circle, LoaderCircle } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { ToolPart } from "../ai-elements/tool";
import {
  activityDisplayState,
  activitySummary,
  initialActivityDisclosure,
  reconcileActivityDisclosure,
} from "./activity-groups";
import { ToolActivity } from "./tool-activity";
import { toolNeedsAttention } from "./tool-activity-state";

export function ActivityGroup({
  parts,
  approve,
  isReadonly,
  isRunning = false,
  children,
}: {
  parts: ToolPart[];
  approve: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  isReadonly: boolean;
  isRunning?: boolean;
  children?: ReactNode;
}) {
  const summary = activitySummary(parts, isRunning);
  const singleton = parts.length === 1;
  const [disclosure, setDisclosure] = useState(() => ({
    ...initialActivityDisclosure(summary),
    singleton,
  }));
  const [inspectedCallId, setInspectedCallId] = useState<string | null>(null);
  const inspecting = parts.some((part) => part.toolCallId === inspectedCallId);
  if (inspectedCallId !== null && !inspecting) {
    setInspectedCallId(null);
  }
  const onDetailsOpenChange = useCallback((id: string, open: boolean) => {
    // A removed/older dialog must not clear a newer row's inspection.
    setInspectedCallId((inspected) =>
      open ? id : inspected === id ? null : inspected
    );
  }, []);
  const reconciled = reconcileActivityDisclosure(disclosure, summary);
  const current = {
    ...reconciled,
    // The first row stays mounted when streaming adds a second step. Expose the
    // new group without hiding a manually opened excerpt or approval controls.
    open:
      inspecting || (disclosure.singleton && !singleton)
        ? true
        : reconciled.open,
    singleton,
  };
  // While its dialog is open, retain the source row through completion. Store
  // that open choice so Radix can return focus to the same trigger on close.
  if (
    reconciled !== disclosure ||
    disclosure.singleton !== singleton ||
    (inspecting && !disclosure.open)
  ) {
    setDisclosure(current);
  }
  const attention = toolNeedsAttention(summary.state);
  const setOpen = useCallback((open: boolean) => {
    setDisclosure((value) => ({ ...value, open }));
  }, []);
  return (
    <Task
      className="min-w-0 max-w-full"
      data-testid={singleton ? "tool-step" : "activity-group"}
      onOpenChange={setOpen}
      open={singleton || current.open}
    >
      {!singleton && (
        <TaskTrigger className="flex max-w-full items-center gap-2 min-h-9 rounded-md py-2 pr-2 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
              current.open && "rotate-90"
            )}
          />
          <span className="shrink-0 font-medium text-foreground">执行过程</span>
          <span className="shrink-0 text-xs tabular-nums">
            {summary.count} 个步骤
          </span>
          <span aria-hidden="true" className="text-border">
            ·
          </span>
          <span
            className={cn(
              "min-w-0 truncate text-xs",
              attention && "font-medium text-destructive",
              summary.state === "approval-requested" &&
                "text-amber-700 dark:text-amber-400"
            )}
            role="status"
          >
            {summary.label}
          </span>
          {!!summary.active && (
            <LoaderCircle
              aria-hidden="true"
              className="size-3 shrink-0 animate-spin motion-reduce:animate-none"
            />
          )}
        </TaskTrigger>
      )}
      <TaskContent
        className={cn("min-w-0", !singleton && "pt-1")}
        data-testid={singleton ? undefined : "activity-timeline"}
        forceMount
        hidden={!singleton && !current.open}
      >
        <ol
          className={cn(
            "min-w-0",
            !singleton && "ml-[6px] space-y-1 border-l border-border/60 pl-4"
          )}
          role={singleton ? "presentation" : undefined}
        >
          {parts.map((part) => {
            const state = activityDisplayState(part, isRunning);
            return (
              <li className="relative min-w-0" key={part.toolCallId}>
                {!singleton && (
                  <span
                    className={cn(
                      "absolute -left-[21px] top-3 flex size-[9px] items-center justify-center rounded-full bg-background ring-2 ring-background",
                      toolNeedsAttention(state)
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground/70"
                    )}
                  >
                    {state === "output-available" ? (
                      <Check className="size-2.5" />
                    ) : (
                      <Circle className="size-2 fill-current" />
                    )}
                  </span>
                )}
                <ToolActivity
                  approve={approve}
                  isReadonly={isReadonly}
                  isRunning={isRunning}
                  key={part.toolCallId}
                  onDetailsOpenChange={onDetailsOpenChange}
                  part={part}
                  timeline={!singleton}
                />
              </li>
            );
          })}
        </ol>
      </TaskContent>
      {children}
    </Task>
  );
}
