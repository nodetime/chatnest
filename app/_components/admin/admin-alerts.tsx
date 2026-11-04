"use client";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/app/_components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";
import type { AlertsSnapshot } from "@/server/domain/admin/alerts";

const endpoint = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/admin/alerts`;
type AlertsResult =
  | { status: "ok"; snapshot: AlertsSnapshot; cursors: (string | null)[] }
  | { status: "denied" };
async function load(
  url: string,
  cursors: (string | null)[] = [null]
): Promise<AlertsResult> {
  const cursor = cursors.at(-1);
  const target = cursor
    ? `${url}?${new URLSearchParams({ historyCursor: cursor })}`
    : url;
  const response = await fetch(target, { cache: "no-store", method: "GET" });
  if (response.status === 401 || response.status === 403) {
    return { status: "denied" };
  }
  if (!response.ok) {
    throw new Error("告警快照读取失败，请刷新重试。");
  }
  return { cursors, snapshot: await response.json(), status: "ok" };
}

function Metrics({ values }: { values: [string, number | string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function AlertsSnapshotView({
  data,
  historyControls,
}: {
  data: AlertsSnapshot;
  historyControls?: ReactNode;
}) {
  const settlement =
    data.settlement.status === "available" ? data.settlement.data : null;
  const payment =
    data.payment.status === "available" ? data.payment.data : null;
  const labels = {
    failed: "失败",
    other: "其他异常",
    processing: "处理中",
    received: "待处理",
    refund_due: "退款待处理",
  };
  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted-foreground">
        服务端采样完成：{data.checkedAt}
      </p>
      <Card>
        <CardHeader>
          <CardTitle>最近告警投递历史</CardTitle>
          <CardDescription>
            保留30天，每页最多30条；HTTP接受不代表值班确认。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.alertHistory.status === "available" ? (
            data.alertHistory.data.items.length ? (
              <ul className="divide-y">
                {data.alertHistory.data.items.map((event) => (
                  <li className="py-3 text-sm" key={event.id}>
                    <p>
                      {event.kind === "worker_failed"
                        ? "Worker运行失败"
                        : "账务需要关注"}{" "}
                      ·{" "}
                      {
                        {
                          delivered: "接收端HTTP接受",
                          failed: "投递失败",
                          pending: "结果未知",
                          skipped: "告警地址未配置",
                        }[event.outcome]
                      }
                      {event.httpStatus ? `（HTTP ${event.httpStatus}）` : ""}
                    </p>
                    {event.reasons.includes("payment_case_due") ? (
                      <p className="text-muted-foreground">
                        支付案件临期或逾期
                      </p>
                    ) : null}
                    {event.reasons.includes("payment_case_gap") ? (
                      <p className="text-muted-foreground">
                        支付案件有额度缺口
                      </p>
                    ) : null}
                    <time dateTime={event.createdAt}>{event.createdAt}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p>保留期内暂无告警记录。</p>
            )
          ) : (
            <p role="status">告警历史暂不可用，不代表没有告警。</p>
          )}
          {historyControls}
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>结算队列</CardTitle>
            <CardDescription>
              来自当前 ChatNest 数据库；不是 worker 存活检测。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settlement ? (
              <>
                <Metrics
                  values={[
                    ["待处理", settlement.pending],
                    ["处理中", settlement.processing],
                    ["重试失败", settlement.failed],
                    ["死信", settlement.deadLettered],
                  ]}
                />
                <p className="text-sm text-muted-foreground">
                  最早未完成结算：{settlement.oldestPendingAt ?? "无未完成任务"}
                </p>
              </>
            ) : (
              <p role="status">结算数据暂不可用，当前状态未知。</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>支付恢复</CardTitle>
            <CardDescription>
              来自 Payload 当前快照；支付异常不等同于模型服务故障。
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payment ? (
              <Metrics
                values={[
                  ["失败", payment.failed],
                  ["待处理", payment.received],
                  ["处理中", payment.processing],
                  ["退款待处理", payment.refundDue],
                  ["开放案件原付款", payment.caseRisk.total],
                  [
                    "案件已逾期或 24 小时内到期",
                    payment.caseRisk.dueSoonOrOverdue,
                  ],
                  ["有额度缺口的原付款", payment.caseRisk.withGap],
                  ["待处理收件箱", payment.inboxCount],
                  ["最久未完成支付事件（秒）", payment.webhookLagSeconds],
                  [
                    "支付事件处理成功率",
                    payment.completedSamples === 0
                      ? "暂无已完成样本"
                      : `${payment.successRate}%`,
                  ],
                ]}
              />
            ) : (
              <p role="status">支付数据暂不可用，当前状态未知。</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>需要关注的支付事件</CardTitle>
          <CardDescription>
            最多显示 20 条，详细处置在账务页面进行。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {payment ? (
            payment.attention.length ? (
              <ul className="divide-y">
                {payment.attention.map((event, index) => (
                  <li
                    className="flex justify-between gap-4 py-3 text-sm"
                    // biome-ignore lint/suspicious/noArrayIndexKey: immutable read-only snapshot items have no public identifiers or local component state.
                    key={`${event.createdAt}-${event.status}-${index}`}
                  >
                    <span>{labels[event.status]}</span>
                    <time dateTime={event.createdAt}>{event.createdAt}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                当前快照没有需要关注的支付事件。
              </p>
            )
          ) : (
            <p role="status">事件列表未读取成功，不代表没有异常。</p>
          )}
          <Link
            className="text-sm underline underline-offset-4"
            href="/admin/billing"
          >
            前往账务处理
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>告警投递证据</CardTitle>
          <CardDescription>配置状态与真实投递结果分别展示。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            当前应用配置：
            {data.delivery.webhookConfigured
              ? "已设置告警地址"
              : "未设置告警地址"}
          </p>
          <p>worker 实际配置与正式投递结果尚未验证。</p>
          <p className="text-muted-foreground">
            告警历史仅代表已保存的单次投递事实，不代表渠道持续健康。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
export function AdminAlerts() {
  const { data: session, status } = useSession();
  const subject = status === "authenticated" ? session?.user?.id : undefined;
  return (
    <AdminAlertsSession
      key={subject ?? "anonymous"}
      sessionDenied={status === "unauthenticated"}
      subject={subject}
    />
  );
}
function AdminAlertsSession({
  subject,
  sessionDenied,
}: {
  subject?: string;
  sessionDenied: boolean;
}) {
  const [paging, setPaging] = useState(false);
  const latestRead = useRef(0);
  const [pageError, setPageError] = useState(false);
  // One confirmed page per subject, not a cache per cursor. A 403 replaces the entire snapshot.
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    subject ? [endpoint, subject] : null,
    ([url]) => load(url),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );
  const snapshot = subject && data?.status === "ok" ? data.snapshot : undefined;
  const denied = data?.status === "denied" || sessionDenied;
  const changePage = useCallback(
    async (positions: (string | null)[], requireHistory = true) => {
      latestRead.current += 1;
      const revision = latestRead.current;
      setPaging(true);
      setPageError(false);
      try {
        await mutate(
          load(endpoint, positions).then((result) => {
            if (
              requireHistory &&
              result.status === "ok" &&
              result.snapshot.alertHistory.status !== "available"
            ) {
              throw new Error("HISTORY_UNAVAILABLE");
            }
            return result;
          }),
          { revalidate: false }
        );
      } catch {
        if (revision === latestRead.current) {
          setPageError(true);
        }
      } finally {
        if (revision === latestRead.current) {
          setPaging(false);
        }
      }
    },
    [mutate]
  );
  const busy = paging || isValidating || !subject;
  const cursors = data?.status === "ok" ? data.cursors : [null];
  const next =
    snapshot?.alertHistory.status === "available"
      ? snapshot.alertHistory.data.nextCursor
      : null;
  const refresh = useCallback(() => changePage([null], false), [changePage]);
  const previousPage = useCallback(
    () => changePage(cursors.slice(0, -1)),
    [changePage, cursors]
  );
  const nextPage = useCallback(
    () => (next ? changePage([...cursors, next]) : undefined),
    [changePage, cursors, next]
  );
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">告警与恢复</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            只读快照。刷新不会执行回放、退款或发送告警。
          </p>
        </div>
        <Button
          disabled={isValidating || !subject}
          onClick={refresh}
          size="sm"
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          刷新状态
        </Button>
      </div>
      {!!(error || pageError) && (
        <p
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
          role="alert"
        >
          告警快照读取失败，请刷新重试。
          {snapshot
            ? "下方保留上次已确认页面，不代表当前状态。"
            : "当前状态未知。"}
        </p>
      )}
      {!!(isLoading || paging) && <p role="status">正在读取告警快照…</p>}
      {!!denied && (
        <p role="alert">管理员权限已失效，请重新登录或联系管理员。</p>
      )}
      {!!snapshot && (
        <AlertsSnapshotView
          data={snapshot}
          historyControls={
            snapshot.alertHistory.status === "available" ? (
              <nav
                aria-label="告警历史分页"
                className="mt-4 flex flex-wrap items-center gap-3"
              >
                <Button
                  disabled={busy || cursors.length <= 1}
                  onClick={previousPage}
                  size="sm"
                  variant="outline"
                >
                  上一页
                </Button>
                <span aria-live="polite" className="text-sm">
                  第 {cursors.length} 页
                </span>
                <Button
                  disabled={busy || !next}
                  onClick={nextPage}
                  size="sm"
                  variant="outline"
                >
                  下一页
                </Button>
              </nav>
            ) : undefined
          }
        />
      )}
    </>
  );
}
