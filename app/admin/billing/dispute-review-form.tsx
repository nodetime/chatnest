"use client";

import { type FormEvent, useCallback, useState } from "react";
import { accountErrorMessage } from "@/app/_components/account/account-error";
import { Button } from "@/app/_components/ui/button";
import { ApprovalRequestSchema } from "@/server/application/platform/generated/schemas";

export function DisputeReviewForm({
  sourcePaymentEventId,
  onCreated,
}: {
  sourcePaymentEventId: number;
  onCreated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      setBusy(true);
      setError("");
      try {
        const input = ApprovalRequestSchema.parse({
          action: "dispute_review",
          evidenceReference: String(data.get("evidenceReference")).trim(),
          reason: data.get("reason"),
          resourceId: String(sourcePaymentEventId),
        });
        const response = await fetch("/api/admin/billing/approvals", {
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          const failure = await response.json();
          throw new Error(failure.code);
        }
        form.reset();
        await onCreated();
      } catch (cause) {
        setError(
          accountErrorMessage(
            cause instanceof Error ? cause.message : undefined,
            "申请未提交，请检查凭证编号及原因后重试。"
          )
        );
      } finally {
        setBusy(false);
      }
    },
    [sourcePaymentEventId, onCreated]
  );
  return (
    <details className="mt-2 rounded border p-3">
      <summary className="cursor-pointer font-medium">申请解除额度限制</summary>
      <form className="mt-2 grid gap-2" onSubmit={submit}>
        <p className="text-muted-foreground">
          全部案件终结且原付款无缺口后才可申请。由另一位管理员批准并执行，不退回已扣积分，也不改变余额或有效期。
        </p>
        <label className="grid gap-1">
          人工核查凭证编号
          <input
            className="rounded border bg-background p-2"
            maxLength={200}
            minLength={3}
            name="evidenceReference"
            required
          />
        </label>
        <label className="grid gap-1">
          核查原因
          <textarea
            className="rounded border bg-background p-2"
            maxLength={500}
            minLength={3}
            name="reason"
            required
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <Button disabled={busy} type="submit" variant="outline">
          {busy ? "正在核验…" : "核验并提交解限申请"}
        </Button>
      </form>
    </details>
  );
}
