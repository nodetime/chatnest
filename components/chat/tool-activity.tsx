"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Globe,
  Monitor,
  Search,
} from "lucide-react";
import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAgentInfo } from "@/hooks/use-agent-info";
import { collectSourceLinks } from "@/lib/agent/sources";
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
  const name =
    part.type === "dynamic-tool" ? part.toolName : part.type.slice(5);
  const { data: info } = useAgentInfo();
  const input = part.input as
    | {
        name?: string;
        query?: string;
        q?: string;
        url?: string;
        filename?: string;
      }
    | undefined;
  // MCP arguments are arbitrary JSON. Only project actual text into the
  // compact action line; the complete original input stays in call details.
  const attachment =
    name === "readAttachment" && part.state === "output-available"
      ? parseAttachmentReadResult(part.output)
      : null;
  const context =
    attachment?.name ??
    [input?.query, input?.q, input?.url, input?.filename, input?.name].find(
      (value) => typeof value === "string" && value.trim().length > 0
    );
  const output = part.output as
    | { displayName?: string; description?: string }
    | undefined;
  const skill =
    name === "loadSkill"
      ? info?.skills.find((item) => item.name === input?.name)
      : undefined;
  const browserTitles: Record<string, string> = {
    browser_click: "点击页面",
    browser_close: "关闭网页",
    browser_navigate: "打开网页",
    browser_press_key: "操作键盘",
    browser_scroll: "滚动页面",
    browser_snapshot: "查看网页",
    browser_tabs: "管理网页标签",
    browser_take_screenshot: "查看页面截图",
    browser_type: "输入内容",
  };
  const shortName = name.split("__").at(-1) ?? name;
  const title =
    name === "createResultTable"
      ? "生成表格产物"
      : name === "readAttachment"
        ? "读取文件"
        : name === "loadSkill"
          ? typeof output?.displayName === "string"
            ? output.displayName
            : (skill?.displayName ?? "读取调查方法")
          : name === "readSkillResource"
            ? "读取方法参考"
            : name.includes("search")
              ? "搜索资料"
              : name.includes("extract") || name.includes("fetch")
                ? "读取网页正文"
                : (browserTitles[shortName] ?? "执行工具");
  const sources = name.includes("__") ? collectSourceLinks(part.output) : [];
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
  const [allSources, setAllSources] = useState(false);
  const sourceListId = useId();
  const toggleSources = useCallback(() => setAllSources((value) => !value), []);
  const visibleSources = allSources ? sources : sources.slice(0, 3);
  const MethodIcon =
    name === "readAttachment"
      ? FileText
      : name === "loadSkill"
        ? BookOpen
        : name === "readSkillResource"
          ? FileText
          : name.includes("search")
            ? Search
            : name.includes("fetch") || name.includes("extract")
              ? Globe
              : name.startsWith("browser__")
                ? Monitor
                : undefined;
  const methodDescription =
    (typeof output?.description === "string"
      ? output.description
      : undefined) ??
    skill?.shortDescription ??
    skill?.description ??
    "读取方法指引，再根据目标选择后续操作。";
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
        <div className="flex w-fit max-w-full items-center">
          <ToolHeader
            appearance={timeline ? "timeline" : "compact"}
            className="w-fit max-w-full flex-initial"
            context={context}
            icon={
              MethodIcon ? (
                <MethodIcon className="size-4 shrink-0 text-muted-foreground" />
              ) : undefined
            }
            inlineContext={name === "readAttachment"}
            state={displayState}
            statusLabel={
              incomplete
                ? "未完成"
                : name === "readAttachment" &&
                    part.state === "output-available" &&
                    !attachment
                  ? "已返回"
                  : name === "loadSkill" && part.state === "output-available"
                    ? "方法已就绪"
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
        <ToolContent className="space-y-3 px-3 pb-3 pt-1">
          {name === "loadSkill" && (
            <p className="text-sm leading-6 text-muted-foreground">
              {methodDescription}
            </p>
          )}
          {typeof input?.query === "string" &&
            input.query &&
            part.state !== "approval-requested" && (
              <p className="break-words text-sm text-muted-foreground">
                查找：{input.query}
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
          {name === "readAttachment" && part.state === "output-available" && (
            <AttachmentReadResult output={part.output} />
          )}
          {sources.length > 0 && (
            <div
              className="mb-3 flex flex-wrap items-center gap-1.5"
              id={sourceListId}
            >
              {visibleSources.map((source) => (
                <a
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  href={source.url}
                  key={source.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={`${source.title} · ${new URL(source.url).hostname}`}
                >
                  <span className="min-w-0 max-w-[200px] truncate">
                    {source.title}
                  </span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              ))}
              {sources.length > 3 && (
                <Button
                  aria-controls={sourceListId}
                  aria-expanded={allSources}
                  aria-label={allSources ? "收起来源" : "展开全部来源"}
                  className="text-muted-foreground"
                  onClick={toggleSources}
                  size="xs"
                  variant="ghost"
                >
                  {allSources ? "收起" : `+${sources.length - 3} 条来源`}
                </Button>
              )}
            </div>
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
              <p className="break-words text-muted-foreground [overflow-wrap:anywhere]">
                {context ?? "查看调用详情中的工具名称与参数，再决定是否执行。"}
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
