"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Check, ChevronRight, Circle, LoaderCircle } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  const [disclosure, setDisclosure] = useState(() =>
    initialActivityDisclosure(summary)
  );
  const current = reconcileActivityDisclosure(disclosure, summary);
  if (current !== disclosure) {
    setDisclosure(current);
  }
  const attention = toolNeedsAttention(summary.state);
  const setOpen = useCallback((open: boolean) => {
    setDisclosure((value) => ({ ...value, open }));
  }, []);
  return (
    <Collapsible
      className="min-w-0 max-w-full"
      data-testid="activity-group"
      onOpenChange={setOpen}
      open={current.open}
    >
      <CollapsibleTrigger className="flex max-w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
            current.open && "rotate-90"
          )}
        />
        <span className="shrink-0 font-medium text-foreground">执行过程</span>
        <span className="shrink-0 text-xs tabular-nums">
          {summary.count} 次调用
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
      </CollapsibleTrigger>
      <CollapsibleContent
        className="min-w-0 pt-1"
        data-testid="activity-timeline"
      >
        <ol className="ml-[6px] min-w-0 space-y-0.5 border-l border-border/70 pl-4">
          {parts.map((part) => {
            const state = activityDisplayState(part, isRunning);
            return (
              <li className="relative min-w-0" key={part.toolCallId}>
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
                <ToolActivity
                  approve={approve}
                  isReadonly={isReadonly}
                  isRunning={isRunning}
                  part={part}
                  timeline
                />
              </li>
            );
          })}
        </ol>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
