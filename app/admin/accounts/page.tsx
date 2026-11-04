"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { accountErrorMessage } from "@/app/_components/account/account-error";
import { Badge } from "@/app/_components/ui/badge";
import { Button } from "@/app/_components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";

type QueueItem = {
  completedAt: string | null;
  completedBy: string | null;
  email: string;
  id: string;
  name: string | null;
  notificationStatus: "not_configured" | "pending" | "sent";
  reason: string | null;
  requestedAt: string;
  remoteDeactivationError: string | null;
  remoteDeactivationRequestId: string | null;
  remoteDeactivationStatus: "not_required" | "pending" | "completed" | "failed";
  retentionPurgedAt: string | null;
  retentionUntil: string | null;
  status: "cancelled" | "completed" | "requested";
  tombstoneId: string | null;
  userId: string;
};

export default function AdminAccountsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState("");
  const [confirming, setConfirming] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/accounts/deletion-requests", {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | QueueItem[]
        | { code?: string };
      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(
          "code" in payload ? payload.code : "DELETION_QUEUE_UNAVAILABLE"
        );
      }
      setItems(payload);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? accountErrorMessage(
              reason.message,
              "删除申请队列读取失败，请稍后刷新。"
            )
          : "删除申请队列读取失败，请稍后刷新。"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const refresh = useCallback(() => {
    load().catch(() => undefined);
  }, [load]);
  const cancelConfirmation = useCallback(() => {
    setConfirming("");
  }, []);
  const requestConfirmation = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      setConfirming(event.currentTarget.dataset.requestId ?? "");
    },
    []
  );

  const handleComplete = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      const {
        currentTarget: { dataset },
      } = event;
      const { requestId } = dataset;
      if (!requestId) {
        return;
      }
      setProcessing(requestId);
      setError("");
      try {
        const response = await fetch("/api/admin/accounts/deletion-requests", {
          body: JSON.stringify({ confirm: "COMPLETE", requestId }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          const payload = (await response.json()) as { code?: string };
          throw new Error(payload.code || "DELETION_PROCESSING_UNAVAILABLE");
        }
        setConfirming("");
        await load();
      } catch (reason) {
        setError(
          reason instanceof Error
            ? accountErrorMessage(
                reason.message,
                "删除申请处理失败，请稍后重试。"
              )
            : "删除申请处理失败，请稍后重试。"
        );
      } finally {
        setProcessing("");
      }
    },
    [load]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">账户与数据</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            仅管理员可处理删除申请；先匿名化登录资料并撤销会话，保留账务与审计事实，保留期结束后再清理个人内容。
          </p>
        </div>
        <Button disabled={loading} onClick={refresh} variant="outline">
          <RefreshCw className="size-4" /> 刷新
        </Button>
      </div>
      {error ? (
        <p
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>账户删除申请</CardTitle>
          <CardDescription>
            “已匿名化”表示登录资料已处理；“已完成清理”表示保留期后的个人内容已清理。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">暂无删除申请。</p>
          ) : null}
          {items.map((item) => (
            <div
              className="rounded-lg border border-border/70 p-4"
              key={item.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{item.name || "未命名账户"}</p>
                  <p className="text-sm text-muted-foreground">{item.email}</p>
                </div>
                <Badge
                  variant={
                    item.status === "requested" ? "destructive" : "outline"
                  }
                >
                  {item.status === "requested"
                    ? "待处理"
                    : item.status === "completed"
                      ? item.retentionPurgedAt
                        ? "已完成清理"
                        : "已匿名化"
                      : "已撤回"}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                申请时间：{new Date(item.requestedAt).toLocaleString("zh-CN")}
                {item.reason ? ` · 原因：${item.reason}` : ""}
              </p>
              {item.status === "completed" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  远端身份：
                  {item.remoteDeactivationStatus === "completed"
                    ? "已停用"
                    : item.remoteDeactivationStatus === "not_required"
                      ? "未接入平台"
                      : "待重试"}
                  {item.retentionPurgedAt
                    ? " · 个人内容已清理"
                    : item.retentionUntil
                      ? ` · 脱敏事实保留至 ${new Date(item.retentionUntil).toLocaleDateString("zh-CN")}`
                      : ""}
                </p>
              ) : null}
              {item.status === "requested" ? (
                confirming === item.id ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      data-request-id={item.id}
                      disabled={processing === item.id}
                      onClick={handleComplete}
                      size="sm"
                      variant="destructive"
                    >
                      <ShieldCheck className="size-4" /> 确认匿名化并撤销会话
                    </Button>
                    <Button
                      onClick={cancelConfirmation}
                      size="sm"
                      variant="outline"
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <Button
                    data-request-id={item.id}
                    onClick={requestConfirmation}
                    size="sm"
                    variant="outline"
                  >
                    处理申请
                  </Button>
                )
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
