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
import { useCallback, useState } from "react";
import { useAgentInfo } from "@/hooks/use-agent-info";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Tool,
  ToolContent,
  ToolHeader,
  type ToolPart,
} from "../ai-elements/tool";
import { activityDisplayState, activityErrorText } from "./activity-groups";
import {
  AttachmentReadResult,
  parseAttachmentReadResult,
} from "./attachment-read-result";
import {
  initialToolDisclosure,
  reconcileToolDisclosure,
  toolDisclosureIdentity,
  toolNeedsAttention,
} from "./tool-activity-state";
import { ToolCallDetails } from "./tool-call-details";
import {
  projectResult,
  projectToolIdentity,
  projectToolResult,
} from "./tool-presentation";
import { ToolResultPreview } from "./tool-result-preview";

export function ToolActivity({
  part,
  approve,
  isReadonly,
  isRunning,
  timeline = false,
  onDetailsOpenChange,
}: {
  part: ToolPart;
  approve: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  isReadonly: boolean;
  isRunning: boolean;
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
  const handleDeny = useCallback(() => {
    if (approval) {
      approve({ approved: false, id: approval.id, reason: "用户拒绝执行" });
    }
  }, [approve, approval]);
  const handleAllow = useCallback(() => {
    if (approval) {
      approve({ approved: true, id: approval.id });
    }
  }, [approve, approval]);
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
              incomplete
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
                : errorText === "An error occurred."
                  ? "工具暂时未能返回结果，请稍后重试。"
                  : errorText}
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
              <p className="break-all font-mono text-xs text-muted-foreground">
                {name}
              </p>
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
          {part.state === "approval-requested" && approval && !isReadonly && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
              <span className="mr-auto text-xs text-muted-foreground">
                执行前需要你的确认
              </span>
              <button
                className="min-h-9 rounded-md border px-3 text-sm transition-colors hover:bg-accent"
                onClick={handleDeny}
                type="button"
              >
                拒绝
              </button>
              <button
                className="min-h-9 rounded-md bg-foreground px-3 text-sm text-background transition-opacity hover:opacity-85"
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
