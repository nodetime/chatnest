"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "@/app/_lib/types";
import { hasRunFailure } from "@/server/domain/message/run-failure";
import type { ToolPart } from "../ai-elements/tool";
import { activityDisplayState } from "./activity-groups";

export function hasRecoverableToolFailure(message: ChatMessage) {
  if (message.role !== "assistant") {
    return false;
  }
  const tools = message.parts.filter(
    (part): part is ChatMessage["parts"][number] & ToolPart =>
      part.type === "dynamic-tool" || part.type.startsWith("tool-")
  );
  // Resolve the current confirmation before asking the Agent to continue.
  return (
    !tools.some((part) => part.state === "approval-requested") &&
    (hasRunFailure(message) ||
      tools.some(
        (part) => activityDisplayState(part, false) === "output-error"
      ))
  );
}

export function RuntimeRecovery({
  message,
  status,
  isReadonly,
  isLatest,
  sendMessage,
}: {
  message: ChatMessage;
  status: UseChatHelpers<ChatMessage>["status"];
  isReadonly: boolean;
  isLatest: boolean;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
}) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const available =
    isLatest &&
    !isReadonly &&
    status !== "streaming" &&
    status !== "submitted" &&
    hasRecoverableToolFailure(message);

  const recover = useCallback(async () => {
    if (!available || lock.current) {
      return;
    }
    lock.current = true;
    setPending(true);
    setFailed(false);
    try {
      // A new user turn retains the failed call and its original evidence.
      // Only the Agent chooses whether/how to act; this is not a tool replay.
      await sendMessage({
        parts: [
          {
            text: "请继续处理刚才失败或未完成的步骤。先核对已有执行结果，确认是否可能已经产生副作用；不要盲目重复操作。请自行判断重试、换一种方法或向我询问；需要授权的操作请重新请求确认。",
            type: "text",
          },
        ],
        role: "user",
      });
    } catch {
      lock.current = false;
      setPending(false);
      setFailed(true);
    }
  }, [available, sendMessage]);

  if (!available) {
    return null;
  }
  return (
    <div className="space-y-2" data-testid="runtime-recovery">
      <p className="text-xs leading-5 text-muted-foreground">
        原始记录已保留。让 Agent 判断下一步，不会直接重复工具操作。
      </p>
      <button
        className="min-h-9 rounded-md border border-border/70 px-3 text-[13px] transition-colors hover:bg-accent disabled:cursor-wait disabled:opacity-50"
        disabled={pending}
        onClick={recover}
        type="button"
      >
        让 Agent 继续处理
      </button>
      {!!pending && (
        <p className="text-xs text-muted-foreground" role="status">
          正在发送继续处理请求…
        </p>
      )}
      {!!failed && (
        <p className="text-xs text-destructive" role="alert">
          请求未能发送，请再试一次。
        </p>
      )}
    </div>
  );
}
