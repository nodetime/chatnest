"use client";

import type { FormEvent } from "react";
import { useCallback, useState } from "react";
import { accountErrorMessage } from "@/app/_components/account/account-error";
import { Button } from "@/app/_components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";
import { Input } from "@/app/_components/ui/input";
import { Label } from "@/app/_components/ui/label";
import { Textarea } from "@/app/_components/ui/textarea";
import {
  ApprovalRequestSchema,
  BillingApprovalSchema,
} from "@/server/application/platform/generated/schemas";

export function WalletAdjustmentForm({
  onCreated,
}: {
  onCreated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy) {
        return;
      }
      const form = event.currentTarget;
      const fields = new FormData(form);
      const organizationId = fields.get("organizationId");
      const parsed = ApprovalRequestSchema.safeParse({
        action: "wallet_adjust",
        deltaPoints: fields.get("deltaPoints"),
        reason: fields.get("reason"),
        resourceId: fields.get("userId"),
        ...(organizationId ? { organizationId } : {}),
      });
      setError("");
      setMessage("");
      if (!parsed.success) {
        setError("请检查用户编号、组织编号、积分格式和调账原因。");
        return;
      }
      setBusy(true);
      try {
        const response = await fetch("/api/admin/billing/approvals", {
          body: JSON.stringify(parsed.data),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            typeof result.code === "string"
              ? result.code
              : "APPROVAL_REQUEST_FAILED"
          );
        }
        BillingApprovalSchema.parse(result.approval);
        form.reset();
        setMessage("调账申请已提交，等待另一位管理员审批。");
        await onCreated();
      } catch (reason: unknown) {
        setError(
          accountErrorMessage(
            reason instanceof Error ? reason.message : undefined,
            "调账申请或列表刷新未完成，请检查待处理审批后重试。"
          )
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, onCreated]
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>申请钱包调账</CardTitle>
        <CardDescription>
          使用平台后台用户编号。提交申请不执行调账；后台冻结当前钱包版本，另一位管理员核对并批准后执行，余额变化后须重新申请。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          aria-label="钱包调账申请"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={submit}
        >
          <div className="space-y-2">
            <Label htmlFor="wallet-user-id">调账用户编号</Label>
            <Input
              autoComplete="off"
              id="wallet-user-id"
              inputMode="numeric"
              name="userId"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wallet-org-id">调账组织编号（可选）</Label>
            <Input
              autoComplete="off"
              id="wallet-org-id"
              inputMode="numeric"
              name="organizationId"
              placeholder="留空表示个人钱包"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wallet-delta">调账积分</Label>
            <Input
              autoComplete="off"
              id="wallet-delta"
              name="deltaPoints"
              placeholder="例如 5 或 -2.5，最多 6 位小数"
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="wallet-reason">调账原因</Label>
            <Textarea
              id="wallet-reason"
              maxLength={500}
              minLength={3}
              name="reason"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={busy} type="submit">
              {busy ? "提交中…" : "提交调账申请"}
            </Button>
          </div>
          {message !== "" && (
            <p className="text-sm sm:col-span-2" role="status">
              {message}
            </p>
          )}
          {error !== "" && (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
