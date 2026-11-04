"use client";

import { Coins, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { accountErrorMessage } from "@/app/_components/account/account-error";
import { Button } from "@/app/_components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/_components/ui/table";
import {
  operationStateLabel,
  outcomeLabel,
  purposeLabel,
  sessionLabel,
  sessionStatusLabel,
  subjectLabel,
} from "./usage-labels";

import { mergeUsagePages, UsageRequestScope } from "./usage-pagination";

type SessionSummary = {
  capturedPoints: string;
  chatId: string;
  createdAt: string;
  reservedPoints: string;
  runId: string | null;
  sessionGroupId: string;
  status: string;
  stepsCount: number;
};
type SessionDetails = {
  page?: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    totalSteps: number;
  };
  session: { chatId: string; sessionGroupId: string; status: string };
  steps: Array<{
    operationId: string;
    canonicalToolKey: string;
    capturedPoints: string;
    outcome: string | null;
    reservedPoints: string;
    state: string;
    subjectType: string;
    usage: { inputTokens: number; outputTokens: number } | null;
  }>;
  totals: { capturedPoints: string; reservedPoints: string };
};

export default function UsagePage() {
  const { data: authSession, status: sessionStatus } = useSession();
  const subject =
    sessionStatus === "authenticated" && authSession?.user?.type === "regular"
      ? authSession.user.id
      : undefined;
  const [dataOwner, setDataOwner] = useState<string | undefined>(undefined);
  const [storedBalance, setBalance] = useState<string | null>(null);
  const [storedSessions, setSessions] = useState<SessionSummary[]>([]);
  const [storedDetails, setDetails] = useState<SessionDetails | null>(null);
  const listScope = useRef(new UsageRequestScope());
  const detailsScope = useRef(new UsageRequestScope());
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const visible = Boolean(subject) && dataOwner === subject;
  const balance = visible ? storedBalance : null;
  const sessions = visible ? storedSessions : [];
  const details = visible ? storedDetails : null;
  const clearPrivate = useCallback(() => {
    listScope.current.cancel();
    detailsScope.current.cancel();
    setDataOwner(undefined);
    setBalance(null);
    setSessions([]);
    setDetails(null);
    setDetailsLoading(false);
    setDetailsError("");
    setLoading(false);
  }, []);
  const denied = useCallback(() => {
    clearPrivate();
    setMessage("访问权限已失效，请重新登录。");
  }, [clearPrivate]);
  const load = useCallback(async () => {
    if (!subject) {
      return;
    }
    const request = listScope.current.begin();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing", {
        cache: "no-store",
        signal: request.signal,
      });
      if (!request.current()) {
        return;
      }
      if (response.status === 401 || response.status === 403) {
        denied();
        return;
      }
      const payload = (await response.json()) as {
        balancePoints?: string;
        sessions?: SessionSummary[];
        code?: string;
      };
      if (!request.current()) {
        return;
      }
      if (!response.ok) {
        throw new Error(payload.code || "用量读取失败");
      }
      if (
        typeof payload.balancePoints !== "string" ||
        !Array.isArray(payload.sessions)
      ) {
        throw new Error("用量数据不完整");
      }
      setBalance(payload.balancePoints);
      setSessions(payload.sessions);
      setDataOwner(subject);
    } catch (error) {
      if (request.current()) {
        setMessage(
          error instanceof Error
            ? accountErrorMessage(error.message, "用量读取失败，请稍后刷新。")
            : "用量读取失败，请稍后刷新。"
        );
      }
    } finally {
      if (request.current()) {
        setLoading(false);
      }
    }
  }, [subject, denied]);
  useEffect(() => {
    clearPrivate();
    setMessage("");
    if (subject) {
      load().catch(() => undefined);
    }
    return () => {
      listScope.current.cancel();
      detailsScope.current.cancel();
    };
  }, [subject, load, clearPrivate]);

  const fetchDetails = useCallback(
    async (group: string, cursor?: string) => {
      const request = detailsScope.current.begin();
      setDetailsLoading(true);
      setDetailsError("");
      if (!cursor) {
        setDetails(null);
      }
      try {
        const query = new URLSearchParams({
          limit: "100",
          sessionGroupId: group,
        });
        if (cursor) {
          query.set("cursor", cursor);
        }
        const response = await fetch(`/api/billing?${query}`, {
          cache: "no-store",
          signal: request.signal,
        });
        if (!request.current()) {
          return;
        }
        if (response.status === 401 || response.status === 403) {
          denied();
          return;
        }
        if (!response.ok) {
          throw new Error("会话明细读取失败，请重试。");
        }
        const payload = (await response.json()) as SessionDetails;
        if (!request.current()) {
          return;
        }
        if (payload.session.sessionGroupId !== group) {
          throw new Error("会话响应不匹配，请刷新。");
        }
        setDetails((previous) => {
          if (!request.current()) {
            return previous;
          }
          if (!cursor) {
            return payload;
          }
          return previous?.session.sessionGroupId === group
            ? mergeUsagePages(previous, payload)
            : previous;
        });
      } catch (error) {
        if (request.current()) {
          setDetailsError(
            error instanceof Error ? error.message : "会话明细读取失败。"
          );
        }
      } finally {
        if (request.current()) {
          setDetailsLoading(false);
        }
      }
    },
    [denied]
  );
  const openDetails = useCallback(
    (group: string) => fetchDetails(group),
    [fetchDetails]
  );
  const loadMore = useCallback(() => {
    if (detailsLoading || !details?.page?.nextCursor) {
      return;
    }
    fetchDetails(details.session.sessionGroupId, details.page.nextCursor).catch(
      () => undefined
    );
  }, [details, detailsLoading, fetchDetails]);
  useEffect(() => () => detailsScope.current.cancel(), []);
  const refresh = useCallback(() => {
    load().catch(() => undefined);
  }, [load]);
  const closeDetails = useCallback(() => {
    detailsScope.current.cancel();
    setDetails(null);
    setDetailsError("");
    setDetailsLoading(false);
  }, []);
  const handleSessionClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>) => {
      const { sessionGroupId } = event.currentTarget.dataset;
      if (sessionGroupId) {
        openDetails(sessionGroupId).catch(() => undefined);
      }
    },
    [openDetails]
  );
  const handleSessionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      const { sessionGroupId } = event.currentTarget.dataset;
      if (sessionGroupId) {
        openDetails(sessionGroupId).catch(() => undefined);
      }
    },
    [openDetails]
  );
  const balanceLabel = balance ?? (loading ? "读取中…" : "暂不可用");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-10">
      {!!detailsError && !details && <p role="alert">{detailsError}</p>}
      {!!detailsLoading && !details && <p role="status">正在读取会话明细…</p>}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">使用记录</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            查看每次对话用了什么，以及每一步扣了多少积分。
          </p>
        </div>
        <Button disabled={loading} onClick={refresh} variant="outline">
          <RefreshCw className="size-4" /> 刷新
        </Button>
      </div>
      {message ? (
        <p
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
          role="alert"
        >
          {message}
        </p>
      ) : null}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-4" />
            账面余额
          </CardTitle>
          <Button asChild size="sm" variant="outline">
            <Link href="/account/billing">购买方案</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <CardDescription>
            含受限积分，不等于可用于新调用的额度。
          </CardDescription>
          <p className="mt-2 text-4xl font-semibold tabular-nums">
            {balanceLabel}
          </p>
        </CardContent>
      </Card>
      <div
        className={
          details
            ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.85fr)]"
            : ""
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>最近使用</CardTitle>
            <CardDescription>
              选择一次对话，查看模型、工具和每一步扣费。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>会话</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>步骤</TableHead>
                  <TableHead>扣除</TableHead>
                  <TableHead>时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow
                    aria-label={`查看${sessionLabel(session.chatId)}的使用详情`}
                    className="cursor-pointer"
                    data-session-group-id={session.sessionGroupId}
                    key={session.sessionGroupId}
                    onClick={handleSessionClick}
                    onKeyDown={handleSessionKeyDown}
                    tabIndex={0}
                  >
                    <TableCell className="font-medium">
                      {sessionLabel(session.chatId)}
                    </TableCell>
                    <TableCell>{sessionStatusLabel(session.status)}</TableCell>
                    <TableCell>{session.stepsCount} 步</TableCell>
                    <TableCell>{session.capturedPoints} 积分</TableCell>
                    <TableCell>
                      {new Date(session.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {!sessions.length && !loading ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      {message ? (
                        "使用记录暂时无法读取，请先刷新页面。"
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
                          <span>
                            还没有使用记录，开始一次对话后会在这里显示每一步扣费。
                          </span>
                          <Button asChild size="sm">
                            <Link href="/chat">开始对话</Link>
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {details ? (
          <aside className="h-fit lg:sticky lg:top-6">
            <Card>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>
                    本次对话的扣费：{sessionLabel(details.session.chatId)}
                  </CardTitle>
                  <CardDescription>
                    本次共扣除 {details.totals.capturedPoints} 积分
                  </CardDescription>
                </div>
                <Button
                  aria-label="关闭使用详情"
                  onClick={closeDetails}
                  size="icon"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {!!detailsError && (
                  <p role="alert">{detailsError} 已加载的明细保留，可重试。</p>
                )}
                <p className="mb-3 text-sm text-muted-foreground">
                  已加载 {details.steps.length} /{" "}
                  {details.page?.totalSteps ?? "未知"} 步
                </p>
                <div className="space-y-3">
                  {details.steps.map((step, index) => (
                    <div
                      className="rounded-lg border border-border/70 p-3"
                      key={step.operationId}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">
                            第 {index + 1} 步 · {subjectLabel(step.subjectType)}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {purposeLabel(
                              step.subjectType,
                              step.canonicalToolKey
                            )}
                          </p>
                        </div>
                        <span className="text-sm font-medium tabular-nums">
                          {step.capturedPoints} 积分
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{operationStateLabel(step.state)}</span>
                        <span>{outcomeLabel(step.outcome)}</span>
                        {step.usage ? (
                          <details>
                            <summary className="cursor-pointer">
                              查看技术详情
                            </summary>
                            <span className="mt-1 block">
                              模型输入量{" "}
                              {step.usage.inputTokens.toLocaleString()} · 输出量{" "}
                              {step.usage.outputTokens.toLocaleString()}
                            </span>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                {!!details.page?.hasMore && (
                  <Button
                    className="mt-4"
                    disabled={detailsLoading}
                    onClick={loadMore}
                    variant="outline"
                  >
                    {detailsLoading ? "正在加载…" : "加载更多明细"}
                  </Button>
                )}
                {!details.page && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    当前服务未提供完整分页信息。
                  </p>
                )}
              </CardContent>
            </Card>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
