"use client";
import { useCallback, useState } from "react";
import { Button } from "@/app/_components/ui/button";

export function AgentPauseNotice({
  pending,
  onContinue,
}: {
  pending: boolean;
  onContinue: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resume = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onContinue();
    } catch {
      setError("暂未继续，已有内容仍然保留，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }, [busy, onContinue]);
  return (
    <div
      className="flex flex-wrap items-center gap-3 py-2 text-xs text-muted-foreground"
      data-testid="agent-paused"
    >
      <span role="status">
        已停止
        {pending ? "，回答待处理的问题或确认后可继续。" : "，已有内容已保留。"}
      </span>
      {!pending && (
        <Button disabled={busy} onClick={resume} size="sm" variant="outline">
          {busy ? "正在继续…" : "继续任务"}
        </Button>
      )}
      {!!error && (
        <span className="w-full text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
