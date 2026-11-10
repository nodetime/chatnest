"use client";

import { AlertCircle, RotateCcw, X } from "lucide-react";
import { useCallback } from "react";
import { useActiveChat } from "@/app/_hooks/use-active-chat";
import type { Attachment } from "@/app/_lib/types";
import { cn } from "@/app/_lib/utils";
import { ChatbotError } from "@/server/shared/errors";

export function ConversationNotice({
  onRestore,
  attachments,
  standalone = false,
}: {
  onRestore: () => void;
  attachments: Attachment[];
  standalone?: boolean;
}) {
  const { error, clearError, loadError, retryLoad, status, messages, input } =
    useActiveChat();
  const dismiss = useCallback(() => clearError(), [clearError]);
  const lastUser = messages.findLast((message) => message.role === "user");
  const previousText = lastUser?.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  const previousFiles =
    lastUser?.parts.filter((part) => part.type === "file") ?? [];
  const draftRestored =
    Boolean(previousText || previousFiles.length) &&
    input === previousText &&
    previousFiles.length === attachments.length &&
    previousFiles.every((file) =>
      attachments.some((attachment) => attachment.url === file.url)
    );
  // Live errors own this notice; Shell suppresses only the latest persisted
  // marker until dismissal. An old snapshot cannot swallow a new send error.
  if (
    !loadError &&
    (!error || status === "streaming" || status === "submitted")
  ) {
    return null;
  }
  const loadStatus =
    loadError instanceof ChatbotError ? loadError.statusCode : undefined;
  const accessHint =
    loadStatus === 401
      ? "请登录后重新打开链接。"
      : loadStatus === 403
        ? "请使用有权限的账号打开。"
        : null;
  const title = loadError
    ? loadStatus === 401
      ? "登录后可查看这段对话"
      : loadStatus === 403
        ? "当前账号无权查看这段对话"
        : "对话加载失败"
    : draftRestored
      ? "消息未完成，已恢复到输入框"
      : "消息未能完成";
  const Title = standalone ? "h2" : "p";
  const diagnostic = loadStatus
    ? `HTTP ${loadStatus}\n${loadError?.message}`
    : (loadError ?? error)?.message;

  return (
    <div
      className={cn(
        "flex items-start gap-2 text-[13px] text-muted-foreground",
        standalone
          ? "gap-3 rounded-2xl border border-border bg-card p-5"
          : "mb-2 px-1 py-1.5"
      )}
      data-testid="conversation-error"
      role="alert"
    >
      <AlertCircle
        aria-hidden="true"
        className={cn("mt-0.5 shrink-0", standalone ? "size-5" : "size-3.5")}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "flex gap-x-3 gap-y-1",
            standalone
              ? "flex-col items-start gap-y-2"
              : "flex-wrap items-center"
          )}
        >
          <Title
            className={
              standalone ? "text-base font-medium text-foreground" : undefined
            }
          >
            {title}
          </Title>
          {accessHint ? (
            <p>{accessHint}</p>
          ) : loadError ? (
            <button
              className={cn(
                "inline-flex items-center gap-1 text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                standalone
                  ? "min-h-11 gap-2 rounded-lg border border-border bg-secondary/50 px-3 font-medium hover:bg-secondary"
                  : "rounded-sm hover:underline"
              )}
              onClick={retryLoad}
              type="button"
            >
              <RotateCcw className="size-3" />
              重新加载
            </button>
          ) : draftRestored ? null : (
            <button
              className="rounded-sm text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              onClick={onRestore}
              type="button"
            >
              恢复输入
            </button>
          )}
        </div>
        <details className={cn("text-xs", standalone ? "mt-2" : "mt-1")}>
          <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
            详情
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
            {diagnostic}
          </pre>
        </details>
      </div>
      {!loadError && (
        <button
          aria-label="关闭执行提示"
          className="rounded-sm p-0.5 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
          onClick={dismiss}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
