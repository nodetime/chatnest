// biome-ignore-all lint/performance/noJsxPropsBind: Interactive product cards use stable local handlers.
"use client";

import { Check, CreditCard, Loader2, RefreshCw, Sparkles } from "lucide-react";
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
import { createCheckoutIdempotencyKey } from "@/app/_lib/idempotency";
import type {
  PlansResponse,
  PlatformPlan,
} from "@/server/application/platform/generated/types";

type Subscription = {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  plan: { name: string } | null;
  status: string;
  subscriptionId: string;
};

const subscriptionStatusLabels: Record<string, string> = {
  active: "生效中",
  canceled: "已取消",
  incomplete: "待完成",
  past_due: "待补缴",
  paused: "已暂停",
  trialing: "试用中",
};

function subscriptionStatusLabel(status: string): string {
  return subscriptionStatusLabels[status] ?? "处理中";
}

function currencyLabel(currency: string): string {
  const labels: Record<string, string> = {
    CNY: "人民币",
    USD: "美元",
  };
  return labels[currency] ?? currency;
}

function formatPlanPrice(plan: Pick<PlatformPlan, "currency" | "priceCents">) {
  return `${(plan.priceCents / 100).toFixed(2)} ${currencyLabel(plan.currency)} / 月`;
}

export function BillingPageClient() {
  const [data, setData] = useState<PlansResponse | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutSlug, setCheckoutSlug] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const spendableLabel = loading
    ? "读取中…"
    : (data?.spendablePoints ?? "暂不可用");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [plansResponse, subscriptionsResponse] = await Promise.all([
        fetch("/api/billing/plans?organizationId=", { cache: "no-store" }),
        fetch("/api/billing/subscriptions?organizationId=", {
          cache: "no-store",
        }),
      ]);
      const plans = (await plansResponse.json()) as PlansResponse & {
        code?: string;
      };
      if (!plansResponse.ok) {
        throw new Error(plans.code || "产品读取失败");
      }
      const subscriptionPayload = (await subscriptionsResponse.json()) as {
        subscriptions?: Subscription[];
      };
      setData(plans);
      setSubscriptions(subscriptionPayload.subscriptions ?? []);
    } catch (error) {
      setData(null);
      setMessage(
        error instanceof Error
          ? accountErrorMessage(error.message, "产品读取失败，请稍后刷新。")
          : "产品读取失败，请稍后刷新。"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const checkout = useCallback(async (plan: PlatformPlan) => {
    setCheckoutSlug(plan.slug);
    setMessage("");
    try {
      const response = await fetch("/api/billing/checkout", {
        body: JSON.stringify({
          idempotencyKey: await createCheckoutIdempotencyKey({
            nonce: crypto.randomUUID(),
            planSlug: plan.slug,
          }),
          organizationId: null,
          planSlug: plan.slug,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as {
        checkoutUrl?: string;
        code?: string;
      };
      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.code || "支付页面创建失败");
      }
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? accountErrorMessage(error.message, "支付页面创建失败，请稍后重试。")
          : "支付页面创建失败，请稍后重试。"
      );
    } finally {
      setCheckoutSlug(null);
    }
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6 lg:p-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline">账户方案</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            方案与余额
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            先选择方案，再查看当前余额。模型和工具会按实际使用步骤扣除积分。
          </p>
        </div>
        <Button
          disabled={loading}
          onClick={() => load().catch(() => undefined)}
          variant="outline"
        >
          <RefreshCw className="size-4" />
          刷新
        </Button>
      </header>
      {message ? (
        <p
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
          role="alert"
        >
          {message}
        </p>
      ) : null}
      <section>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardDescription>可新用积分</CardDescription>
            <CardTitle>个人账户</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-4xl font-semibold tabular-nums"
              data-testid="billing-spendable-points"
            >
              {spendableLabel}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              可用于新的模型和工具调用。
            </p>
            {!loading && data ? (
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">账面余额</dt>
                  <dd
                    className="tabular-nums"
                    data-testid="billing-balance-points"
                  >
                    {data.balancePoints}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">受限积分</dt>
                  <dd
                    className="tabular-nums"
                    data-testid="billing-restricted-points"
                  >
                    {data.restrictedPoints}
                  </dd>
                </div>
              </dl>
            ) : null}
          </CardContent>
        </Card>
      </section>
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">选择方案</h2>
        </div>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="h-48 animate-pulse" />
            <Card className="h-48 animate-pulse" />
            <Card className="h-48 animate-pulse" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {(data?.plans ?? []).map((plan, index) => (
              <Card
                className={
                  index === 1
                    ? "border-primary shadow-lg shadow-primary/10"
                    : ""
                }
                key={plan.slug}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>{plan.name}</CardTitle>
                    {index === 1 ? <Badge>推荐</Badge> : null}
                  </div>
                  <CardDescription>
                    每月获得 {plan.monthlyPoints} 积分
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <p className="text-3xl font-semibold">
                    {formatPlanPrice(plan)}
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <Check className="size-4 text-emerald-500" />
                      按月方案，自动续费
                    </li>
                    <li className="flex gap-2">
                      <Check className="size-4 text-emerald-500" />
                      每次会话都可查看扣费明细
                    </li>
                  </ul>
                  <Button
                    disabled={checkoutSlug !== null}
                    onClick={() => checkout(plan)}
                  >
                    {checkoutSlug === plan.slug ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CreditCard className="size-4" />
                    )}
                    购买方案
                  </Button>
                </CardContent>
              </Card>
            ))}
            {data?.plans.length ? null : message ? (
              <Card className="md:col-span-3">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  产品方案暂时无法读取，请先刷新页面。
                </CardContent>
              </Card>
            ) : (
              <Card className="md:col-span-3">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  暂无可购买方案，请联系管理员配置产品。
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>订阅状态</CardTitle>
          <CardDescription>
            购买完成后，支付确认会自动更新订阅周期和状态。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {message && !data ? (
            <p className="text-sm text-muted-foreground">
              订阅状态暂时无法读取，请先刷新页面。
            </p>
          ) : subscriptions.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {subscriptions.map((subscription) => (
                <div
                  className="flex items-center justify-between rounded-lg border p-4"
                  key={subscription.subscriptionId}
                >
                  <div>
                    <p className="font-medium">
                      {subscription.plan?.name ?? "订阅方案"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {subscriptionStatusLabel(subscription.status)}
                      {subscription.currentPeriodEnd
                        ? ` · 到期 ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      subscription.status === "active" ? "default" : "outline"
                    }
                  >
                    {subscription.cancelAtPeriodEnd
                      ? "周期结束后取消"
                      : subscriptionStatusLabel(subscription.status)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              当前账户还没有已开通的方案。
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
