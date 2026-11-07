import {
  ArrowRight,
  CircleUserRound,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/app/_components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";
import { auth } from "@/app/(auth)/auth";
import { loadAccountOverview } from "@/server/application/account/overview";
import { createUserPlatformClient } from "@/server/application/platform/user-client";

const personalCards = [
  {
    action: "查看方案",
    description: "查看当前余额和按月方案。",
    href: "/account/billing",
    icon: WalletCards,
    title: "方案与余额",
  },
  {
    action: "查看记录",
    description: "按对话查看模型、工具和每一步扣费。",
    href: "/account/usage",
    icon: ReceiptText,
    title: "使用记录",
  },
] as const;

const subscriptionStatusLabels: Record<string, string> = {
  active: "生效中",
  canceled: "已取消",
  incomplete: "待完成",
  past_due: "待补缴",
  paused: "已暂停",
  trialing: "试用中",
};

export default async function AccountOverviewPage() {
  const session = await auth();
  const overview = await loadAccountOverview({
    createClient: () =>
      session?.user
        ? createUserPlatformClient(session.user)
        : Promise.resolve(null),
    user: {
      email: session?.user?.email,
      id: session?.user?.id ?? "",
      name: session?.user?.name,
    },
  });
  const statusLabel =
    overview.billing.status === "connected"
      ? "已更新"
      : overview.billing.status === "degraded"
        ? "正在更新"
        : "暂不可用";
  const accountStatusLabel =
    overview.billing.status === "connected"
      ? "账户正常"
      : overview.billing.status === "degraded"
        ? "余额正在同步"
        : "余额暂不可用";
  const recentDate = overview.recentUsage
    ? new Date(overview.recentUsage.createdAt).toLocaleString("zh-CN")
    : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-10">
      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <CircleUserRound className="size-4" />
              个人账户
            </div>
            <h1 className="mt-2 text-2xl font-semibold">
              {overview.account.name || overview.account.email || "我的账户"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {overview.account.email || "当前登录账户"}
            </p>
          </div>
          <Badge variant="outline">{accountStatusLabel}</Badge>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="border-border/60 bg-background/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                账面余额
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">
                {overview.billing.balancePoints ?? "暂不可用"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {statusLabel}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                最近使用
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overview.recentUsage ? (
                <>
                  <p className="text-lg font-semibold">
                    {overview.recentUsage.stepsCount} 个步骤
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {recentDate} · 扣除 {overview.recentUsage.capturedPoints}{" "}
                    积分
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">还没有用量记录</p>
              )}
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                当前方案
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overview.subscription ? (
                <>
                  <p className="text-lg font-semibold">
                    {overview.subscription.planName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {subscriptionStatusLabels[overview.subscription.status] ??
                      "处理中"}
                  </p>
                  {overview.subscription.currentPeriodEnd ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      当前周期至{" "}
                      {new Date(
                        overview.subscription.currentPeriodEnd
                      ).toLocaleDateString("zh-CN")}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">尚未订阅</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    选择方案后按月获得积分
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {personalCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              className="group transition-colors hover:border-primary/40"
              key={card.href}
            >
              <CardHeader>
                <Icon className="size-5 text-primary" />
                <CardTitle className="mt-3">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {card.description}
                </p>
                <Link
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary"
                  href={card.href}
                >
                  {card.action}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </main>
  );
}
