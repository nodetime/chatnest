"use client";

import { type FormEvent, useCallback, useState } from "react";
import { accountErrorMessage } from "@/app/_components/account/account-error";
import { Button } from "@/app/_components/ui/button";
import { ApprovalRequestSchema } from "@/server/application/platform/generated/schemas";

export function RefundRecoveryForm({
  paymentEventId,
  onComplete,
}: {
  paymentEventId: number;
  onComplete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (form.get("customerChoice") !== "on") {
        return;
      }
      setBusy(true);
      setError("");
      try {
        const input = ApprovalRequestSchema.parse({
          action: "refund_recovery",
          customerResolutionReference: form.get("customerReference"),
          disposition: "customer_elected_original_entitlement",
          reason: form.get("reason"),
          resourceId: String(paymentEventId),
        });
        const response = await fetch("/api/admin/billing/approvals", {
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          const failure = await response.json();
          throw new Error(
            typeof failure.code === "string"
              ? failure.code
              : "REFUND_RECOVERY_REQUEST_FAILED"
          );
        }
        onComplete();
      } catch (reason: unknown) {
        setError(
          accountErrorMessage(
            reason instanceof Error ? reason.message : "",
            "返款证据尚未就绪或申请失败，请核对后重试。"
          )
        );
      } finally {
        setBusy(false);
      }
    },
    [paymentEventId, onComplete]
  );
  return (
    <details className="w-full rounded-md border p-3">
      <summary className="cursor-pointer font-medium">
        核验返款并申请恢复原额度
      </summary>
      <form className="mt-3 grid gap-3" onSubmit={submit}>
        <p className="text-muted-foreground">
          仅用于已核实本金返还，且客户选择恢复原额度替代本次现金退款的情况。额度保持原有效期；申请不会立即修改余额，需要另一位管理员复核并执行。
        </p>
        <label
          className="grid gap-1"
          htmlFor={`refund-reference-${paymentEventId}`}
        >
          客户选择凭证编号
          <input
            className="rounded border bg-background p-2"
            id={`refund-reference-${paymentEventId}`}
            maxLength={200}
            minLength={3}
            name="customerReference"
            required
          />
        </label>
        <label
          className="grid gap-1"
          htmlFor={`refund-reason-${paymentEventId}`}
        >
          恢复原因
          <textarea
            className="rounded border bg-background p-2"
            id={`refund-reason-${paymentEventId}`}
            maxLength={500}
            minLength={3}
            name="reason"
            required
          />
        </label>
        <label className="flex items-start gap-2">
          <input name="customerChoice" required type="checkbox" />
          客户已明确选择恢复原额度，凭证已核验
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <Button disabled={busy} type="submit" variant="outline">
          {busy ? "正在核验返款…" : "核验并提交恢复申请"}
        </Button>
      </form>
    </details>
  );
}
