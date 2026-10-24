"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import {
  BookOpen,
  FileText,
  Globe,
  LoaderCircle,
  Monitor,
  Search,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  Tool,
  ToolContent,
  ToolHeader,
  type ToolPart,
} from "@/app/_components/ai-elements/tool";
import {
  activityDisplayState,
  activityErrorText,
} from "@/app/_components/chat/activity-groups";
import {
  AttachmentReadResult,
  parseAttachmentReadResult,
} from "@/app/_components/chat/attachment-read-result";
import {
  initialToolDisclosure,
  reconcileToolDisclosure,
  toolDisclosureIdentity,
  toolNeedsAttention,
} from "@/app/_components/chat/tool-activity-state";
import { ToolCallDetails } from "@/app/_components/chat/tool-call-details";
import {
  projectResult,
  projectToolIdentity,
  projectToolResult,
} from "@/app/_components/chat/tool-presentation";
import { ToolResultPreview } from "@/app/_components/chat/tool-result-preview";
import { useAgentInfo } from "@/app/_hooks/use-agent-info";
import type { ChatMessage } from "@/app/_lib/types";
import { cn } from "@/app/_lib/utils";

export function ToolActivity({
  part,
  approve,
  isReadonly,
  isRunning,
  canApprove = true,
  timeline = false,
  onDetailsOpenChange,
}: {
  part: ToolPart;
  approve: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  isReadonly: boolean;
  isRunning: boolean;
  canApprove?: boolean;
  timeline?: boolean;
  onDetailsOpenChange?: (toolCallId: string, open: boolean) => void;
}) {
  const { data: info } = useAgentInfo();
  const {
    name,
    title,
    context: inputContext,
    skillLoaded,
    kind,
    origin,
  } = projectToolIdentity(
    part,
    info?.servers?.flatMap((server) => server.toolAliases ?? [])
  );
  const attachment =
    part.type === "tool-readAttachment" && part.state === "output-available"
      ? parseAttachmentReadResult(part.output)
      : null;
  const context = attachment?.name ?? inputContext;
  const approval = "approval" in part ? part.approval : undefined;
  const displayState = activityDisplayState(part, isRunning);
  const errorText = activityErrorText(part);
  // The exact native table step hands off to DocumentPreview on success. Do not
  // open a temporary dialog that this authoritative artifact renderer replaces.
  // Terminal/fallback evidence and dynamic MCP lookalikes keep call details.
  const nativeArtifactPending =
    part.type === "tool-createResultTable" &&
    isRunning &&
    ["input-streaming", "input-available", "approval-responded"].includes(
      displayState
    );
  const incomplete =
    displayState === "output-error" &&
    part.state !== "output-error" &&
    part.state !== "output-available";
  const identity = toolDisclosureIdentity(part);
  const [disclosure, setDisclosure] = useState(() =>
    initialToolDisclosure(displayState, identity)
  );
  const currentDisclosure = reconcileToolDisclosure(
    disclosure,
    displayState,
    identity
  );
  if (currentDisclosure !== disclosure) {
    setDisclosure(currentDisclosure);
  }
  const { open } = currentDisclosure;
  const setOpen = useCallback((value: boolean) => {
    setDisclosure((current) => ({ ...current, open: value }));
  }, []);
  const MethodIcon =
    part.type === "tool-readAttachment" ||
    part.type === "tool-readSkillResource"
      ? FileText
      : part.type === "tool-loadSkill"
        ? BookOpen
        : name.startsWith("browser__") && title !== name
          ? Monitor
          : kind === "search"
            ? Search
            : kind === "web"
              ? Globe
              : undefined;
  const handleDetailsOpenChange = useCallback(
    (value: boolean) => onDetailsOpenChange?.(part.toolCallId, value),
    [onDetailsOpenChange, part.toolCallId]
  );
  const decisionIdentity = JSON.stringify([
    part.toolCallId,
    approval?.id,
    part.state,
  ]);
  const decisionLock = useRef<{ identity: string; pending: boolean }>({
    identity: decisionIdentity,
    pending: false,
  });
  if (decisionLock.current.identity !== decisionIdentity) {
    decisionLock.current = { identity: decisionIdentity, pending: false };
  }
  const [decision, setDecision] = useState({
    error: false,
    identity: decisionIdentity,
    pending: false,
  });
  const pendingDecision =
    decision.identity === decisionIdentity && decision.pending;
  const decisionError =
    decision.identity === decisionIdentity && decision.error;
  const submitDecision = useCallback(
    async (approved: boolean) => {
      if (
        !approval ||
        part.state !== "approval-requested" ||
        isReadonly ||
        !canApprove ||
        decisionLock.current.identity !== decisionIdentity ||
        decisionLock.current.pending
      ) {
        return;
      }
      const request = decisionLock.current;
      request.pending = true;
      setDecision({ error: false, identity: decisionIdentity, pending: true });
      try {
        await approve({
          approved,
          id: approval.id,
          ...(approved ? {} : { reason: "用户拒绝执行" }),
        });
        // Keep the decision locked until the canonical approval event changes.
        // Resolving the callback alone must not re-enable a second decision.
      } catch {
        if (decisionLock.current === request) {
          request.pending = false;
          setDecision({
            error: true,
            identity: decisionIdentity,
            pending: false,
          });
        }
      }
    },
    [approval, approve, canApprove, decisionIdentity, isReadonly, part.state]
  );
  const handleDeny = useCallback(() => submitDecision(false), [submitDecision]);
  const handleAllow = useCallback(() => submitDecision(true), [submitDecision]);
  return (
    <div
      className={timeline ? "max-w-full" : "my-1 max-w-full"}
      data-testid="tool-activity"
    >
      <Tool
        className={cn(
          "mb-0 overflow-hidden rounded-lg border-transparent bg-transparent",
          toolNeedsAttention(displayState) &&
            "border-border/70 bg-secondary/50",
          displayState === "approval-requested" &&
            "border-amber-600/20 bg-amber-500/5"
        )}
        onOpenChange={setOpen}
        open={open}
      >
        <div className="flex w-full min-w-0 items-start">
          <ToolHeader
            appearance={timeline ? "timeline" : "compact"}
            className="min-w-0 flex-1"
            context={context}
            icon={
              [
                "input-streaming",
                "input-available",
                "approval-responded",
              ].includes(displayState) ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
                />
              ) : MethodIcon ? (
                <MethodIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : undefined
            }
            inlineContext={
              part.type === "tool-readAttachment" ||
              part.type === "tool-readSkillResource" ||
              kind === "search" ||
              kind === "web"
            }
            state={displayState}
            statusLabel={
              displayState === "approval-responded" && isRunning
                ? "执行中"
                : incomplete
                  ? "未完成"
                  : part.type === "tool-readAttachment" &&
                      part.state === "output-available" &&
                      !attachment
                    ? "已返回"
                    : skillLoaded
                      ? "技能已加载"
                      : undefined
            }
            title={title}
            {...(part.type === "dynamic-tool"
              ? { toolName: name, type: "dynamic-tool" }
              : { type: part.type })}
          />
          {!nativeArtifactPending && (
            <ToolCallDetails
              onOpenChange={handleDetailsOpenChange}
              part={part}
            />
          )}
        </div>
        <ToolContent className="space-y-2 py-1 pl-9 pr-3 pb-3 text-[13px]">
          {displayState === "input-streaming" && (
            <p className="text-sm text-muted-foreground">正在准备调用参数…</p>
          )}
          {["input-available", "approval-responded"].includes(displayState) && (
            <p className="text-sm text-muted-foreground">
              正在等待工具返回结果…
            </p>
          )}
          {displayState === "output-denied" && (
            <p className="text-sm text-muted-foreground">
              这次操作已被拒绝，未执行。
            </p>
          )}
          {!!(incomplete || errorText) && (
            <p className="text-sm text-destructive" role="alert">
              {incomplete
                ? "本轮没有收到执行结果，该步骤尚未完成。"
                : "这一步未能完成。错误原文保留在调用详情中。"}
            </p>
          )}
          {part.type === "tool-readAttachment" &&
            part.state === "output-available" && (
              <AttachmentReadResult output={part.output} />
            )}
          {displayState === "output-available" &&
            part.type !== "tool-readAttachment" && (
              <div className="space-y-2">
                {!!origin && (
                  <p className="text-xs text-muted-foreground">{origin}</p>
                )}
                <ToolResultPreview preview={projectToolResult(part)} />
              </div>
            )}
          {displayState === "output-error" && !incomplete && !errorText && (
            <p className="text-sm text-destructive" role="alert">
              工具执行失败，未返回错误说明。
            </p>
          )}
          {part.state === "approval-requested" && (
            <div
              className="space-y-1.5 py-1 text-sm leading-6"
              data-testid="tool-approval-summary"
            >
              <p className="font-medium">请确认这次操作：{title}</p>
              {!!origin && (
                <p className="text-xs text-muted-foreground">{origin}</p>
              )}
              <ToolResultPreview
                parameters
                preview={projectResult(part.input, "parameters")}
              />
              <p className="text-xs text-muted-foreground">
                完整参数保留在查看调用详情中。
              </p>
            </div>
          )}
          {part.state === "approval-requested" &&
            approval &&
            !isReadonly &&
            canApprove && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
                <span
                  className="mr-auto text-xs text-muted-foreground"
                  role="status"
                >
                  {pendingDecision ? "正在提交你的确认…" : "执行前需要你的确认"}
                </span>
                {!!decisionError && (
                  <p className="w-full text-xs text-destructive" role="alert">
                    确认未能提交，请再试一次。尚未确认执行结果。
                  </p>
                )}
                <button
                  className="min-h-9 rounded-md border px-3 text-sm transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-50"
                  disabled={pendingDecision}
                  onClick={handleDeny}
                  type="button"
                >
                  拒绝
                </button>
                <button
                  className="min-h-9 rounded-md bg-foreground px-3 text-sm text-background transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50"
                  disabled={pendingDecision}
                  onClick={handleAllow}
                  type="button"
                >
                  允许执行
                </button>
              </div>
            )}
        </ToolContent>
      </Tool>
    </div>
  );
}
