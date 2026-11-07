"use client";

import { useEffect, useState } from "react";
import { accountErrorMessage } from "@/app/_components/account/account-error";
import { Button } from "@/app/_components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";

import { CheckoutStatusSchema } from "@/server/application/platform/generated/schemas";
import type { CheckoutStatus } from "@/server/application/platform/generated/types";

const checkoutStatusLabels: Record<CheckoutStatus["status"], string> = {
  canceled: "已取消",
  completed: "已到账",
  created: "待支付",
  expired: "已过期",
  failed: "支付失败",
  partially_refunded: "已部分退款",
  pending: "处理中",
  refunded: "已退款",
};

function currencyLabel(currency: string): string {
  return currency === "CNY" ? "人民币" : currency === "USD" ? "美元" : currency;
}

export default function BillingReturnPage() {
  const [data, setData] = useState<CheckoutStatus | null>(null);
  const [message, setMessage] = useState("正在读取支付状态…");

  useEffect(() => {
    const checkoutId = new URLSearchParams(window.location.search).get(
      "checkoutId"
    );
    if (!checkoutId) {
      setMessage("这笔支付信息不完整，请从方案与余额页面重新打开。");
      return;
    }
    fetch(
      `/api/billing/checkout/status?checkoutId=${encodeURIComponent(checkoutId)}`,
      {
        cache: "no-store",
      }
    )
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            payload &&
              typeof payload === "object" &&
              "code" in payload &&
              typeof payload.code === "string"
              ? payload.code
              : "支付状态读取失败"
          );
        }
        setData(CheckoutStatusSchema.parse(payload));
        setMessage("");
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof Error
            ? accountErrorMessage(
                error.message,
                "支付状态读取失败，请稍后刷新。"
              )
            : "支付状态读取失败，请稍后刷新。"
        );
      });
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:p-10">
      <Card>
        <CardHeader>
          <CardTitle>支付状态</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {message ? <p role="status">{message}</p> : null}
          {data?.refundAttention === "review_required" ? (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
              role="alert"
            >
              <p className="font-medium">退款状态待核实</p>
              <p className="mt-1 text-muted-foreground">
                退款存在异常或待恢复事项，请联系支持核实。下方是已应用的账务记录，不代表银行当前到账结果。
              </p>
            </div>
          ) : data?.refundAttention === "pending" ? (
            <div className="rounded-lg border bg-muted/40 p-4" role="status">
              <p className="font-medium">退款正在处理</p>
              <p className="mt-1 text-muted-foreground">
                退款尚有待处理事项。下方仅显示已应用的账务记录，请勿据此判断银行到账。
              </p>
            </div>
          ) : null}
          {data?.refundRecovery ? (
            <div className="rounded-lg border bg-muted/40 p-4" role="status">
              <p className="font-medium">
                原额度已按复核结果处理，现金退款未成功
              </p>
              <p>
                已应用恢复积分：{data.refundRecovery.recoveredPoints}
                ；恢复时可用：{data.refundRecovery.availablePoints}
                ；恢复时已过期：{data.refundRecovery.expiredPoints}。
              </p>
              <p className="mt-1 text-muted-foreground">
                保持原有效期；此处是已应用的额度记录，不代表当前可用余额或银行退款到账。若仍有退款问题，请联系支持。
              </p>
            </div>
          ) : null}
          {data ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">账务记录状态</dt>
                <dd>{checkoutStatusLabels[data.status]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">方案</dt>
                <dd>{data.plan?.name ?? "暂无方案"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">已到账积分</dt>
                <dd>{data.creditedPoints}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">已应用退款积分</dt>
                <dd>{data.refundedPoints}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">金额</dt>
                <dd>
                  {currencyLabel(data.currency)}{" "}
                  {(data.amountCents / 100).toFixed(2)}
                </dd>
              </div>
            </dl>
          ) : null}
          {data?.paymentPosition ? (
            <section aria-label="本单积分" className="space-y-3 border-t pt-4">
              <h2 className="font-medium">本单积分</h2>
              {data.paymentPosition.reviewRequired ? (
                <p className="text-muted-foreground" role="status">
                  本单争议待核实，仅影响这笔订单的积分；下列金额不是银行处理结果。
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(
                  [
                    ["可新用", "spendablePoints"],
                    ["受限", "restrictedPoints"],
                    ["已预留", "heldPoints"],
                    ["已使用", "consumedPoints"],
                    ["已到期", "expiredPoints"],
                    ["已应用拒付", "disputedPoints"],
                  ] as const
                ).map(([label, key]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd
                      className="tabular-nums"
                      data-testid={`checkout-${key}`}
                    >
                      {data.paymentPosition?.[key]}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          <Button asChild variant="outline">
            <a href="/account/billing">返回方案与余额</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
