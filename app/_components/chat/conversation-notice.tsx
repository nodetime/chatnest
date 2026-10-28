"use client";

import { AlertCircle, RotateCcw, X } from "lucide-react";
import { useCallback } from "react";
import { useActiveChat } from "@/app/_hooks/use-active-chat";

export function ConversationNotice({ onRestore }: { onRestore: () => void }) {
  const { error, clearError, loadError, retryLoad, status } = useActiveChat();
  const dismiss = useCallback(() => clearError(), [clearError]);
  // Live errors own this notice; Shell suppresses only the latest persisted
  // marker until dismissal. An old snapshot cannot swallow a new send error.
  if (
    !loadError &&
    (!error || status === "streaming" || status === "submitted")
  ) {
    return null;
  }
  return (
    <div
      className="mb-2 flex items-start gap-2 px-1 py-1.5 text-[13px] text-muted-foreground"
      data-testid="conversation-error"
      role="alert"
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p>{loadError ? "对话加载失败" : "消息未能完成"}</p>
          {loadError ? (
            <button
              className="inline-flex items-center gap-1 rounded-sm text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              onClick={retryLoad}
              type="button"
            >
              <RotateCcw className="size-3" />
              重新加载
            </button>
          ) : (
            <button
              className="rounded-sm text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              onClick={onRestore}
              type="button"
            >
              恢复输入
            </button>
          )}
        </div>
        <details className="mt-1 text-xs">
          <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
            详情
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
            {(loadError ?? error)?.message}
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
