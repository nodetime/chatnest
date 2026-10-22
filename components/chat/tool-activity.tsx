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
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "../ai-elements/tool";
import { activityDisplayState } from "./activity-groups";
import {
  initialToolDisclosure,
  reconcileToolDisclosure,
  toolDisclosureIdentity,
  toolNeedsAttention,
} from "./tool-activity-state";

export function ToolActivity({
  part,
  approve,
  isReadonly,
  isRunning,
  timeline = false,
}: {
  part: ToolPart;
  approve: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  isReadonly: boolean;
  isRunning: boolean;
  timeline?: boolean;
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
        ? "读取附件文字"
        : name === "loadSkill"
          ? (output?.displayName ?? skill?.displayName ?? "读取调查方法")
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
  const incomplete =
    displayState === "output-error" && part.state !== "output-error";
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
    output?.description ??
    skill?.shortDescription ??
    skill?.description ??
    "读取方法指引，再根据目标选择后续操作。";
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
          "mb-0 overflow-hidden rounded-[12px] border-transparent bg-transparent",
          toolNeedsAttention(displayState) && "border-border/60 bg-muted/30"
        )}
        onOpenChange={setOpen}
        open={open}
      >
        <ToolHeader
          appearance={timeline ? "timeline" : "compact"}
          context={
            timeline
              ? (input?.query ??
                input?.q ??
                input?.url ??
                input?.filename ??
                input?.name)
              : undefined
          }
          icon={
            MethodIcon ? (
              <MethodIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : undefined
          }
          state={displayState}
          statusLabel={
            incomplete
              ? "未完成"
              : name === "loadSkill" && part.state === "output-available"
                ? "方法已就绪"
                : undefined
          }
          title={title}
          {...(part.type === "dynamic-tool"
            ? { toolName: name, type: "dynamic-tool" }
            : { type: part.type })}
        />
        <ToolContent className="space-y-3 px-3 pb-3 pt-1">
          {name === "loadSkill" && (
            <p className="text-sm leading-6 text-muted-foreground">
              {methodDescription}
            </p>
          )}
          {!!input?.query && (
            <p className="break-words text-sm text-muted-foreground">
              查找：{input.query}
            </p>
          )}
          {!!(incomplete || part.errorText) && (
            <p className="text-sm text-destructive" role="alert">
              {incomplete
                ? "本轮没有收到执行结果，该步骤尚未完成。"
                : part.errorText === "An error occurred."
                  ? "工具暂时未能返回结果，请稍后重试。"
                  : part.errorText}
            </p>
          )}
          {name === "readAttachment" && part.state === "output-available" && (
            <AttachmentReadSummary output={part.output} />
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
            <ToolInput input={part.input} />
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-1">技术详情</summary>
            <div className="mt-3 min-w-0 space-y-3">
              <p className="break-all font-mono">{name}</p>
              <ToolInput input={part.input} />
              <ToolOutput errorText={part.errorText} output={part.output} />
            </div>
          </details>
          {part.state === "approval-requested" && approval && !isReadonly && (
            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <span className="mr-auto text-xs text-muted-foreground">
                执行前需要你的确认
              </span>
              <button
                className="rounded-lg border px-3 py-1.5 text-xs"
                onClick={handleDeny}
                type="button"
              >
                拒绝
              </button>
              <button
                className="rounded-lg bg-foreground px-3 py-1.5 text-xs text-background"
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

function AttachmentReadSummary({ output }: { output: unknown }) {
  if (!output || typeof output !== "object") {
    return null;
  }
  const data = output as {
    name?: string;
    characters?: number;
    startSegment?: number;
    nextSegment?: number | null;
    totalSegments?: number;
    segments?: { ref: string; text: string }[];
    warnings?: string[];
  };
  return (
    <div className="space-y-2 text-sm" data-testid="attachment-read-result">
      <p className="font-medium">
        {data.name} · 本次读取 {data.characters ?? 0} 字符
      </p>
      <p className="text-xs text-muted-foreground">
        附件原文（非指令） · 共 {data.totalSegments} 段
        {data.nextSegment === null ? " · 已到结尾" : " · 仍有后续内容"}
      </p>
      {data.warnings?.map((warning) => (
        <p className="text-xs text-amber-600" key={warning}>
          {warning}
        </p>
      ))}
      <details>
        <summary className="cursor-pointer text-xs">
          查看本次原文与位置引用
        </summary>
        <div className="max-h-80 overflow-auto space-y-3 pt-2">
          {data.segments?.map((segment) => (
            <div key={segment.ref}>
              <p className="text-xs font-mono text-muted-foreground">
                {segment.ref}
              </p>
              <p className="whitespace-pre-wrap break-words">{segment.text}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
