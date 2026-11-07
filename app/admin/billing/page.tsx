"use client";

import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  Coins,
  RefreshCw,
} from "lucide-react";
import type { ChangeEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/_components/ui/table";
import {
  availableBalanceLabel,
  operationStateLabel,
  purposeLabel,
  subjectLabel,
} from "@/app/_lib/billing-labels";
import { WalletAdjustmentRequestSchema } from "@/server/application/platform/generated/schemas";
import type {
  AdminBillingOverview,
  BillingApproval,
} from "@/server/application/platform/generated/types";
import { DisputeReviewForm } from "./dispute-review-form";
import { RefundRecoveryForm } from "./refund-recovery-form";
import { WalletAdjustmentForm } from "./wallet-adjustment-form";

type Decision = "capture_reserved" | "release_reserved" | "charge_overage";
type Operation = {
  operationId: string;
  subjectType: string;
  canonicalToolKey: string;
  state: string;
  reservedPoints: string;
  capturedPoints: string;
  createdAt: string;
  updatedAt: string;
};
type Overview = AdminBillingOverview;
type Approval = BillingApproval;
type AuditLog = {
  action: string;
  actorId: number | null;
  afterState: Record<string, unknown> | null;
  beforeState: Record<string, unknown> | null;
  createdAt: string;
  id: number;
  resourceType: string;
  result: string;
};
type OverviewFilters = {
  from: string;
  state: string;
  subjectType: "" | "model" | "tool";
  to: string;
};
type BillingHealth = {
  settlement: {
    deadLettered: number;
    failed: number;
    oldestPendingAt: string | null;
    pending: number;
    processing: number;
  } | null;
};

const decisionLabel: Record<string, string> = {
  capture_reserved: "扣除本次积分",
  charge_overage: "补扣差额",
  customer_elected_original_entitlement: "退款失败后恢复原额度",
  release_reserved: "退回本次预留",
};
const auditActionLabel: Record<string, string> = {
  "billing.admin.approval.approved": "允许处理账务变更",
  "billing.admin.approval.consumed": "完成账务变更",
  "billing.admin.approval.requested": "提交账务变更申请",
  "billing.audit.exported": "导出账务审计",
  "billing.dispute.facts_recorded": "记录争议事实（资金待核）",
  "billing.dispute.review_applied": "完成原付款争议核查",
  "billing.operation.reconciled": "完成扣费处理",
  "billing.payment.processed": "支付入账",
  "billing.payment.replay.requested": "申请支付回放",
  "billing.subscription.synced": "同步订阅状态",
  "billing.wallet.adjust": "调整钱包积分",
};

const paymentStatusLabel: Record<string, string> = {
  failed: "处理失败",
  processing: "处理中",
  received: "待处理",
  refund_due: "等待退款",
};

function auditLabel(action: string): string {
  return auditActionLabel[action] ?? "账务变更";
}

function hasApprovalDetails(approval: Approval) {
  switch (approval.action) {
    case "dispute_review":
      return approval.disputeReviewSnapshot !== null;
    case "refund_recovery":
      return approval.recoverySnapshot !== null;
    case "wallet_adjust":
      return approval.deltaPoints !== null;
    case "reconcile":
      return approval.decision !== null;
    default:
      return false;
  }
}

function stateDetail(state: Record<string, unknown> | null): string {
  if (!state) {
    return "无状态变化";
  }
  const parts: string[] = [];
  if (typeof state.state === "string") {
    parts.push(`状态：${operationStateLabel(state.state)}`);
  }
  if (typeof state.balancePoints === "string") {
    parts.push(`余额：${state.balancePoints} 积分`);
  }
  if (typeof state.capturedPoints === "string") {
    parts.push(`已扣：${state.capturedPoints} 积分`);
  }
  if (typeof state.walletMutation === "string") {
    parts.push(`钱包：${state.walletMutation === "credit" ? "增加" : "扣减"}`);
  }
  return parts.join("，") || "状态已更新";
}

export default function BillingAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [health, setHealth] = useState<BillingHealth | null>(null);
  const [error, setError] = useState("");
  const [busyOperation, setBusyOperation] = useState("");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [approvalCursors, setApprovalCursors] = useState<{
    approved: string | null;
    pending: string | null;
  }>({ approved: null, pending: null });
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [operationCursor, setOperationCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<OverviewFilters>({
    from: "",
    state: "",
    subjectType: "",
    to: "",
  });

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (filters.from) {
      query.set("from", filters.from);
    }
    if (filters.state) {
      query.set("state", filters.state);
    }
    if (filters.subjectType) {
      query.set("subjectType", filters.subjectType);
    }
    if (filters.to) {
      query.set("to", filters.to);
    }
    query.set("limit", "20");
    const suffix = query.toString() ? `?${query.toString()}` : "";
    const [
      overviewResponse,
      pendingResponse,
      approvedResponse,
      healthResponse,
    ] = await Promise.all([
      fetch(`/api/admin/billing/overview${suffix}`, { cache: "no-store" }),
      fetch("/api/admin/billing/approvals?status=pending&limit=10", {
        cache: "no-store",
      }),
      fetch("/api/admin/billing/approvals?status=approved&limit=10", {
        cache: "no-store",
      }),
      fetch("/api/admin/billing/health", { cache: "no-store" }),
    ]);
    if (!overviewResponse.ok || !pendingResponse.ok || !approvedResponse.ok) {
      throw new Error("账务数据暂时无法读取");
    }
    const pendingPage = (await pendingResponse.json()) as {
      approvals: Approval[];
      nextCursor: string | null;
    };
    const approvedPage = (await approvedResponse.json()) as {
      approvals: Approval[];
      nextCursor: string | null;
    };
    const overview = (await overviewResponse.json()) as Overview;
    setData(overview);
    setOperationCursor(overview.nextCursor);
    setHealth(
      healthResponse.ok
        ? ((await healthResponse.json()) as BillingHealth)
        : null
    );
    setApprovals([...pendingPage.approvals, ...approvedPage.approvals]);
    setApprovalCursors({
      approved: approvedPage.nextCursor,
      pending: pendingPage.nextCursor,
    });
    const auditResponse = await fetch(
      "/api/admin/billing/audit?scope=billing&limit=10",
      { cache: "no-store" }
    );
    if (auditResponse.ok) {
      const auditPage = (await auditResponse.json()) as {
        audits: AuditLog[];
        nextCursor: string | null;
      };
      setAudits(auditPage.audits);
      setAuditCursor(auditPage.nextCursor);
    } else {
      setAudits([]);
      setAuditCursor(null);
    }
  }, [filters]);

  const loadMoreOperations = useCallback(async () => {
    if (!operationCursor) {
      return;
    }
    const query = new URLSearchParams({
      cursor: operationCursor,
      limit: "20",
    });
    if (filters.from) {
      query.set("from", filters.from);
    }
    if (filters.state) {
      query.set("state", filters.state);
    }
    if (filters.subjectType) {
      query.set("subjectType", filters.subjectType);
    }
    if (filters.to) {
      query.set("to", filters.to);
    }
    const response = await fetch(`/api/admin/billing/overview?${query}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("更多账务记录加载失败");
    }
    const page = (await response.json()) as Overview;
    setData((current) =>
      current
        ? {
            ...current,
            nextCursor: page.nextCursor,
            recentOperations: [
              ...current.recentOperations,
              ...page.recentOperations,
            ],
          }
        : page
    );
    setOperationCursor(page.nextCursor);
  }, [filters, operationCursor]);

  useEffect(() => {
    load().catch((reason: unknown) =>
      setError(
        reason instanceof Error ? reason.message : "账务数据暂时无法读取"
      )
    );
  }, [load]);

  const refresh = useCallback(() => {
    load().catch((reason: unknown) =>
      setError(
        reason instanceof Error ? reason.message : "账务数据暂时无法读取"
      )
    );
  }, [load]);

  const requestApproval = useCallback(
    async (operation: Operation, decision: Decision) => {
      try {
        const response = await fetch("/api/admin/billing/approvals", {
          body: JSON.stringify({
            action: "reconcile",
            decision,
            reason: "后台账务复核",
            resourceId: operation.operationId,
            revision: operation.updatedAt,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          throw new Error("账务申请提交失败");
        }
        await load();
      } catch (reason: unknown) {
        setError(
          reason instanceof Error
            ? accountErrorMessage(
                reason.message,
                "账务申请提交失败，请稍后重试。"
              )
            : "账务申请提交失败，请稍后重试。"
        );
      }
    },
    [load]
  );

  const executeApproval = useCallback(
    async (approval: Approval) => {
      if (approval.approvedBy !== data?.adminId) {
        return;
      }
      setError("");
      setBusyOperation(approval.resourceId);
      try {
        let response: Response;
        if (approval.action === "wallet_adjust") {
          const input = WalletAdjustmentRequestSchema.parse({
            approvalId: approval.approvalId,
            deltaPoints: approval.deltaPoints,
            idempotencyKey: `wallet-adjust:${approval.approvalId}`,
            organizationId: approval.organizationId,
            reason: approval.reason,
          });
          response = await fetch(
            `/api/admin/billing/wallets/${encodeURIComponent(approval.resourceId)}/adjust`,
            {
              body: JSON.stringify(input),
              headers: { "content-type": "application/json" },
              method: "POST",
            }
          );
        } else if (
          approval.action === "refund_recovery" ||
          approval.action === "dispute_review"
        ) {
          if (!hasApprovalDetails(approval)) {
            throw new Error("审批明细不完整，请重新申请。");
          }
          response = await fetch(
            approval.action === "dispute_review"
              ? "/api/admin/billing/dispute-reviews/execute"
              : "/api/admin/billing/refund-recoveries/execute",
            {
              body: JSON.stringify({ approvalId: approval.approvalId }),
              headers: { "content-type": "application/json" },
              method: "POST",
            }
          );
        } else {
          if (!approval.decision) {
            throw new Error("审批明细不完整，请重新申请。");
          }
          response = await fetch(
            `/api/admin/billing/reconcile/${encodeURIComponent(approval.resourceId)}`,
            {
              body: JSON.stringify({
                approvalId: approval.approvalId,
                decision: approval.decision,
              }),
              headers: {
                "content-type": "application/json",
                "if-match": approval.requestedRevision,
              },
              method: "POST",
            }
          );
        }
        if (!response.ok) {
          const failure = await response.json();
          throw new Error(
            typeof failure.code === "string"
              ? failure.code
              : "BILLING_EXECUTION_FAILED"
          );
        }
        await load();
      } catch (reason: unknown) {
        setError(
          reason instanceof Error
            ? accountErrorMessage(
                reason.message,
                "执行结果暂未确认，请重试本申请或刷新核对。"
              )
            : "执行结果暂未确认，请重试本申请或刷新核对。"
        );
      } finally {
        setBusyOperation("");
      }
    },
    [load, data?.adminId]
  );

  const approve = useCallback(
    async (approvalId: string) => {
      try {
        const response = await fetch(
          `/api/admin/billing/approvals/${encodeURIComponent(approvalId)}/approve`,
          { method: "POST" }
        );
        if (!response.ok) {
          throw new Error("审批批准失败");
        }
        await load();
      } catch (reason: unknown) {
        setError(
          reason instanceof Error
            ? accountErrorMessage(reason.message, "审批批准失败，请稍后重试。")
            : "审批批准失败，请稍后重试。"
        );
      }
    },
    [load]
  );

  const handleApprovalClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { approvalId } = event.currentTarget.dataset;
      const approval = approvals.find((item) => item.approvalId === approvalId);
      if (!approval) {
        return;
      }
      if (approval.status === "pending") {
        approve(approval.approvalId).catch(() => undefined);
      } else {
        executeApproval(approval).catch(() => undefined);
      }
    },
    [approvals, approve, executeApproval]
  );

  const loadMoreApprovals = useCallback(async () => {
    const pages = await Promise.all(
      (["pending", "approved"] as const).map(async (status) => {
        const cursor = approvalCursors[status];
        if (!cursor) {
          return { approvals: [] as Approval[], nextCursor: null, status };
        }
        const response = await fetch(
          `/api/admin/billing/approvals?status=${status}&limit=10&cursor=${encodeURIComponent(cursor)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          throw new Error("审批加载失败");
        }
        return {
          ...((await response.json()) as {
            approvals: Approval[];
            nextCursor: string | null;
          }),
          status,
        };
      })
    );
    setApprovals((current) => {
      const byId = new Map(current.map((item) => [item.approvalId, item]));
      for (const page of pages) {
        for (const item of page.approvals) {
          byId.set(item.approvalId, item);
        }
      }
      return [...byId.values()];
    });
    setApprovalCursors((current) => ({
      approved:
        pages.find((page) => page.status === "approved")?.nextCursor ??
        current.approved,
      pending:
        pages.find((page) => page.status === "pending")?.nextCursor ??
        current.pending,
    }));
  }, [approvalCursors]);

  const loadMoreAudit = useCallback(async () => {
    if (!auditCursor) {
      return;
    }
    const response = await fetch(
      `/api/admin/billing/audit?scope=billing&limit=10&cursor=${encodeURIComponent(auditCursor)}`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error("审计加载失败");
    }
    const page = (await response.json()) as {
      audits: AuditLog[];
      nextCursor: string | null;
    };
    setAudits((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const item of page.audits) {
        byId.set(item.id, item);
      }
      return [...byId.values()];
    });
    setAuditCursor(page.nextCursor);
  }, [auditCursor]);

  const handleLoadMoreApprovals = useCallback(() => {
    loadMoreApprovals().catch((reason: unknown) =>
      setError(
        reason instanceof Error
          ? accountErrorMessage(reason.message, "审批加载失败，请稍后刷新。")
          : "审批加载失败，请稍后刷新。"
      )
    );
  }, [loadMoreApprovals]);

  const handleLoadMoreAudit = useCallback(() => {
    loadMoreAudit().catch((reason: unknown) =>
      setError(
        reason instanceof Error
          ? accountErrorMessage(reason.message, "审计加载失败，请稍后刷新。")
          : "审计加载失败，请稍后刷新。"
      )
    );
  }, [loadMoreAudit]);

  const handleLoadMoreOperations = useCallback(() => {
    loadMoreOperations().catch((reason: unknown) =>
      setError(
        reason instanceof Error
          ? accountErrorMessage(
              reason.message,
              "更多账务记录加载失败，请稍后刷新。"
            )
          : "更多账务记录加载失败，请稍后刷新。"
      )
    );
  }, [loadMoreOperations]);

  const pendingOperations = useMemo(
    () =>
      data?.recentOperations.filter((operation) =>
        ["reconcile_pending", "overage_pending"].includes(operation.state)
      ) ?? [],
    [data]
  );
  const handleRequestApproval = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { operationId, decision: rawDecision } =
        event.currentTarget.dataset;
      const decision = rawDecision as Decision | undefined;
      const operation = pendingOperations.find(
        (item) => item.operationId === operationId
      );
      if (operation && decision) {
        requestApproval(operation, decision).catch(() => undefined);
      }
    },
    [pendingOperations, requestApproval]
  );
  const billingAudits = useMemo(
    () => audits.filter((audit) => audit.action.startsWith("billing.")),
    [audits]
  );
  const pendingApprovals = approvals.filter(
    (approval) => approval.status === "pending"
  );
  const approvedApprovals = approvals.filter(
    (approval) => approval.status === "approved"
  );
  const canMutateBilling = data?.adminRole === "admin";
  const handleStateFilterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setFilters((current) => ({ ...current, state: event.target.value }));
    },
    []
  );
  const handleSubjectFilterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setFilters((current) => ({
        ...current,
        subjectType: event.target.value as OverviewFilters["subjectType"],
      }));
    },
    []
  );
  const handleFromFilterChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFilters((current) => ({ ...current, from: event.target.value }));
    },
    []
  );
  const handleToFilterChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFilters((current) => ({ ...current, to: event.target.value }));
    },
    []
  );
  const clearFilters = useCallback(() => {
    setFilters({ from: "", state: "", subjectType: "", to: "" });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">账务</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            先处理需要关注的事项，再查看余额、扣费和支付状态。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canMutateBilling ? (
            <Button asChild variant="outline">
              <a href="/api/admin/billing/audit/export?scope=billing">
                导出变更记录
              </a>
            </Button>
          ) : null}
          <Button onClick={refresh} variant="outline">
            <RefreshCw className="size-4" />
            刷新数据
          </Button>
        </div>
      </div>
      {error && data ? (
        <p
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {error && !data ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <p role="alert">账务数据暂时无法读取，请稍后刷新页面。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 pt-6">
              <label className="space-y-1 text-sm">
                <span className="block text-muted-foreground">状态</span>
                <select
                  aria-label="账务状态筛选"
                  className="h-9 rounded-md border bg-background px-3"
                  onChange={handleStateFilterChange}
                  value={filters.state}
                >
                  <option value="">全部状态</option>
                  <option value="reserved">已预留</option>
                  <option value="dispatched">已发放准入</option>
                  <option value="settled">已结算</option>
                  <option value="released">已释放</option>
                  <option value="reconcile_pending">待对账</option>
                  <option value="overage_pending">超额待处理</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="block text-muted-foreground">对象</span>
                <select
                  aria-label="账务对象筛选"
                  className="h-9 rounded-md border bg-background px-3"
                  onChange={handleSubjectFilterChange}
                  value={filters.subjectType}
                >
                  <option value="">模型与工具</option>
                  <option value="model">模型</option>
                  <option value="tool">工具</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="block text-muted-foreground">开始日期</span>
                <input
                  aria-label="账务开始日期"
                  className="h-9 rounded-md border bg-background px-3"
                  onChange={handleFromFilterChange}
                  type="date"
                  value={filters.from}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="block text-muted-foreground">结束日期</span>
                <input
                  aria-label="账务结束日期"
                  className="h-9 rounded-md border bg-background px-3"
                  onChange={handleToFilterChange}
                  type="date"
                  value={filters.to}
                />
              </label>
              <Button onClick={clearFilters} variant="ghost">
                清除筛选
              </Button>
            </CardContent>
          </Card>
          {canMutateBilling && <WalletAdjustmentForm onCreated={load} />}
          <section
            aria-labelledby="billing-attention-heading"
            className="space-y-4"
          >
            <h2
              className="text-lg font-semibold"
              id="billing-attention-heading"
            >
              需要处理
            </h2>
            {pendingApprovals.length > 0 || approvedApprovals.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>待处理审批</CardTitle>
                  <CardDescription>
                    待审批的申请需要另一位管理员确认；已批准的申请由批准人执行。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[...pendingApprovals, ...approvedApprovals].map(
                    (approval) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                        data-approval-record-id={approval.approvalId}
                        key={approval.approvalId}
                      >
                        <div className="min-w-0 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {approval.action === "dispute_review"
                                ? "争议核查：解除额度限制"
                                : approval.decision
                                  ? (decisionLabel[approval.decision] ??
                                    "账务变更")
                                  : "账务变更"}
                            </p>
                            <Badge
                              variant={
                                approval.status === "pending"
                                  ? "outline"
                                  : "secondary"
                              }
                            >
                              {approval.status === "pending"
                                ? "等待审批"
                                : "等待执行"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            原因：{approval.reason}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            申请管理员：{approval.requestedBy}
                            {approval.approvedBy === null
                              ? ""
                              : ` · 审批管理员：${approval.approvedBy}`}
                          </p>
                          {approval.action === "refund_recovery" &&
                          approval.recoverySnapshot ? (
                            <div className="mt-2 space-y-1 break-all rounded border p-3 text-muted-foreground">
                              <p>
                                客户选择凭证：
                                {
                                  approval.recoverySnapshot
                                    .customerResolutionReference
                                }
                              </p>
                              <p>
                                原付款本金 / 本次返款（最小货币单位）：
                                {approval.recoverySnapshot.capturedMinor} /{" "}
                                {approval.recoverySnapshot.amountMinor}{" "}
                                {approval.recoverySnapshot.currency}
                              </p>
                              <p>
                                恢复积分：
                                {approval.recoverySnapshot.recoveredPoints} ·
                                可用部分：
                                {approval.recoverySnapshot.availablePoints} ·
                                到期部分：
                                {approval.recoverySnapshot.expiredPoints}
                              </p>
                              {approval.recoverySnapshot.lossPosition !==
                                null && (
                                <p>
                                  拒付目标：
                                  {
                                    approval.recoverySnapshot.lossPosition
                                      .disputeTargetBeforePoints
                                  }{" "}
                                  →{" "}
                                  {
                                    approval.recoverySnapshot.lossPosition
                                      .disputeTargetAfterPoints
                                  }{" "}
                                  · 转入拒付：
                                  {
                                    approval.recoverySnapshot.lossPosition
                                      .transferredToDisputePoints
                                  }{" "}
                                  · 拒付缺口：
                                  {
                                    approval.recoverySnapshot.lossPosition
                                      .disputeGapAfterPoints
                                  }
                                  {approval.recoverySnapshot.lossPosition
                                    .reviewRequired
                                    ? " · 原付款仍待核"
                                    : ""}
                                </p>
                              )}
                              <p>
                                原有效期：
                                {approval.recoverySnapshot.originalExpiresAt ??
                                  "无到期限制"}
                                ；不延长有效期
                              </p>
                              <p>
                                恢复同时到期回收：
                                {
                                  approval.recoverySnapshot
                                    .expiredAvailablePoints
                                }{" "}
                                · 钱包净变化：
                                {approval.recoverySnapshot.walletDeltaPoints}
                              </p>
                              <p>
                                银行证据摘要：
                                {approval.recoverySnapshot.providerEvidenceHash}
                              </p>
                            </div>
                          ) : null}
                          {approval.disputeReviewSnapshot ? (
                            <div className="mt-2 space-y-1 break-all rounded border p-3 text-muted-foreground">
                              <p>
                                原订单：
                                {approval.disputeReviewSnapshot.checkoutId}
                              </p>
                              <p>
                                已覆盖{" "}
                                {approval.disputeReviewSnapshot.caseCount}{" "}
                                起案件 · 凭证：
                                {
                                  approval.disputeReviewSnapshot
                                    .evidenceReference
                                }
                              </p>
                              <p>
                                解限后可新用：
                                {approval.disputeReviewSnapshot.spendablePoints}{" "}
                                · 已应用拒付保留：
                                {
                                  approval.disputeReviewSnapshot
                                    .disputeTargetPoints
                                }
                              </p>
                              <p>不改变余额和原有效期。</p>
                            </div>
                          ) : null}
                          {approval.action === "wallet_adjust" && (
                            <div className="mt-1 space-y-1 break-all text-muted-foreground">
                              <p>
                                {approval.organizationId === null
                                  ? "个人钱包"
                                  : `组织钱包：${approval.organizationId}`}{" "}
                                · 用户编号：{approval.resourceId}
                              </p>
                              <p>
                                调整积分：{approval.deltaPoints ?? "明细缺失"}
                              </p>
                              <p>版本：{approval.requestedRevision}</p>
                            </div>
                          )}
                        </div>
                        {approval.status === "pending" &&
                        canMutateBilling &&
                        data?.adminId !== undefined &&
                        approval.requestedBy !== data?.adminId &&
                        hasApprovalDetails(approval) ? (
                          <Button
                            data-approval-id={approval.approvalId}
                            onClick={handleApprovalClick}
                            size="sm"
                            variant="outline"
                          >
                            允许处理
                          </Button>
                        ) : approval.status === "approved" &&
                          hasApprovalDetails(approval) &&
                          canMutateBilling &&
                          data?.adminId !== undefined &&
                          approval.approvedBy === data?.adminId ? (
                          <Button
                            data-approval-id={approval.approvalId}
                            disabled={busyOperation === approval.resourceId}
                            onClick={handleApprovalClick}
                            size="sm"
                          >
                            确认并处理
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {hasApprovalDetails(approval)
                              ? approval.status === "pending"
                                ? canMutateBilling
                                  ? "等待另一位管理员审批"
                                  : "等待管理员审批"
                                : canMutateBilling
                                  ? "等待审批管理员执行"
                                  : "等待管理员执行"
                              : "审批明细不完整，请重新申请"}
                          </span>
                        )}
                      </div>
                    )
                  )}
                  {approvalCursors.pending || approvalCursors.approved ? (
                    <Button onClick={handleLoadMoreApprovals} variant="outline">
                      查看更多申请
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-sm text-muted-foreground">
                  目前没有需要处理的事项。
                </CardContent>
              </Card>
            )}

            {pendingOperations.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>待处理调用</CardTitle>
                  <CardDescription>
                    这些模型或工具调用还没有完成扣费，请选择扣除本次积分或退回本次预留。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pendingOperations.map((operation) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                      key={operation.operationId}
                    >
                      <div className="text-sm">
                        <p className="font-medium">
                          {subjectLabel(operation.subjectType)} ·{" "}
                          {purposeLabel(
                            operation.subjectType,
                            operation.canonicalToolKey
                          )}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          状态：
                          {operationStateLabel(operation.state)} · 本次预扣{" "}
                          {operation.reservedPoints} 积分
                        </p>
                      </div>
                      {canMutateBilling ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            data-decision="capture_reserved"
                            data-operation-id={operation.operationId}
                            disabled={busyOperation === operation.operationId}
                            onClick={handleRequestApproval}
                            size="sm"
                            variant="outline"
                          >
                            扣除本次积分
                          </Button>
                          <Button
                            data-decision="release_reserved"
                            data-operation-id={operation.operationId}
                            disabled={busyOperation === operation.operationId}
                            onClick={handleRequestApproval}
                            size="sm"
                            variant="ghost"
                          >
                            退回本次预留
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          等待管理员复核
                        </span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {data ? (
              <Card>
                <CardHeader>
                  <CardTitle>开放支付案件</CardTitle>
                  <CardDescription>
                    共 {data.paymentCases.total} 笔原付款待核或有缺口；已逾期或
                    24 小时内到期 {data.paymentCases.dueSoonOrOverdue}{" "}
                    笔。有缺口 {data.paymentCases.withGap} 笔。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.paymentCases.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      当前无开放案件。
                    </p>
                  ) : (
                    data.paymentCases.items.map((item) => (
                      <div
                        className="space-y-1 rounded-lg border p-4 text-sm"
                        data-payment-case-checkout={item.checkoutId}
                        key={item.sourcePaymentEventId}
                      >
                        <p className="break-all font-medium">
                          订单 {item.checkoutId}
                        </p>
                        <p>
                          {item.caseCount} 起争议 ·{" "}
                          {item.reviewRequired ? "原付款待核" : "来源额度缺口"}
                        </p>
                        <p className="text-muted-foreground">
                          最早已观察应答期限：{item.dueAt ?? "未知"}
                        </p>
                        <p className="text-muted-foreground">
                          已应用拒付：{item.disputedPoints} · 拒付缺口：
                          {item.disputeGapPoints} · 退款缺口：
                          {item.refundGapPoints}
                        </p>
                        {canMutateBilling &&
                        item.reviewRequired &&
                        item.disputeGapPoints === "0" &&
                        item.refundGapPoints === "0" ? (
                          <DisputeReviewForm
                            onCreated={load}
                            sourcePaymentEventId={item.sourcePaymentEventId}
                          />
                        ) : null}
                      </div>
                    ))
                  )}
                  {data.paymentCases.total > data.paymentCases.items.length ? (
                    <p className="text-sm text-muted-foreground">
                      按已知期限显示前 20 笔。
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {data?.paymentAttention.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>支付事件待处理</CardTitle>
                  <CardDescription>
                    这里只显示脱敏后的失败、处理中、待处理和余额不足退款事件，不包含
                    provider 原始 payload。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.paymentAttention.map((event) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
                      data-payment-event-id={event.paymentEventId}
                      key={event.paymentEventId}
                    >
                      <div>
                        <p className="font-medium">
                          {event.eventType} ·{" "}
                          {paymentStatusLabel[event.status] ?? event.status}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {event.failureReason ?? "需要后台继续处理"}
                        </p>
                      </div>
                      {canMutateBilling &&
                      [
                        "refund.failed",
                        "refund.canceled",
                        "refund.requires_action",
                      ].includes(event.eventType) ? (
                        <RefundRecoveryForm
                          onComplete={refresh}
                          paymentEventId={event.paymentEventId}
                        />
                      ) : null}
                      <span className="text-muted-foreground">
                        {event.amountCents === null
                          ? "金额待核对"
                          : `${event.amountCents / 100} ${event.currency ?? ""}`.trim()}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </section>

          <section
            aria-labelledby="billing-overview-heading"
            className="space-y-4"
          >
            <h2 className="text-lg font-semibold" id="billing-overview-heading">
              运行概况
            </h2>
            <div className="grid gap-4 md:grid-cols-4">
              <Metric
                icon={<ClipboardCheck className="size-4" />}
                label="待处理事项"
                value={String(
                  pendingApprovals.length +
                    approvedApprovals.length +
                    pendingOperations.length
                )}
              />
              <Metric
                icon={<Coins className="size-4" />}
                label="可用余额"
                value={availableBalanceLabel(data?.balancePoints)}
              />
              <Metric
                icon={<Activity className="size-4" />}
                label="已扣除积分"
                value={`${data?.capturedPoints ?? "读取中…"} 积分`}
              />
              <Metric
                icon={<AlertTriangle className="size-4" />}
                label="支付异常"
                value={String(data?.payment.failed ?? "读取中…")}
              />
              <Metric
                icon={<Activity className="size-4" />}
                label="结算死信"
                value={String(health?.settlement?.deadLettered ?? "读取中…")}
              />
            </div>
            {data?.balancePoints === null && (
              <p
                className="text-sm text-amber-700 dark:text-amber-400"
                role="status"
              >
                余额未汇总：待启用 {data.walletAccounting.staged}，已冻结{" "}
                {data.walletAccounting.frozen}，待迁移{" "}
                {data.walletAccounting.missing}，异常待对账{" "}
                {data.walletAccounting.invalid}。未确认额度不计为零余额。
              </p>
            )}
            <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <span>
                个人余额：{availableBalanceLabel(data?.personalBalancePoints)}
              </span>
              <span>
                组织余额：
                {availableBalanceLabel(data?.organizationBalancePoints)}
              </span>
              <span>
                支付成功率：{data ? `${data.payment.successRate}%` : "读取中…"}
              </span>
              <span>
                最久待处理：
                {data ? `${data.payment.webhookLagSeconds} 秒` : "读取中…"}
              </span>
              <span>
                支付收件箱：{data?.payment.inboxCount ?? "读取中…"} 条
              </span>
              <span>
                余额不足退款：{data?.payment.refundDue ?? "读取中…"} 条
              </span>
              <span>
                结算待处理：{health?.settlement?.pending ?? "读取中…"} 条
              </span>
            </div>
          </section>

          <section
            aria-labelledby="billing-history-heading"
            className="order-3 space-y-4"
          >
            <h2 className="text-lg font-semibold" id="billing-history-heading">
              最近记录
            </h2>
            <Card>
              <CardHeader>
                <CardTitle>最近使用记录</CardTitle>
                <CardDescription>
                  按一次模型或工具使用展示，不显示内部操作编号。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>对象</TableHead>
                      <TableHead>用途</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>本次扣除</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.recentOperations.map((operation) => (
                      <TableRow key={operation.operationId}>
                        <TableCell>
                          {subjectLabel(operation.subjectType)}
                        </TableCell>
                        <TableCell>
                          {purposeLabel(
                            operation.subjectType,
                            operation.canonicalToolKey
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              operation.state === "settled"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {operationStateLabel(operation.state)}
                          </Badge>
                        </TableCell>
                        <TableCell>{operation.capturedPoints} 积分</TableCell>
                        <TableCell>
                          {new Date(operation.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {operationCursor ? (
                  <div className="mt-4 flex justify-center">
                    <Button
                      onClick={handleLoadMoreOperations}
                      type="button"
                      variant="outline"
                    >
                      加载更多记录
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>最近变更</CardTitle>
                <CardDescription>
                  显示账务变更、审批及审计导出记录。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {billingAudits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    暂无账务变更记录
                  </p>
                ) : null}
                {billingAudits.map((audit) => (
                  <div
                    className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4 text-sm"
                    key={audit.id}
                  >
                    <div>
                      <p className="font-medium">{auditLabel(audit.action)}</p>
                      <p className="mt-1 text-muted-foreground">
                        {audit.result === "success" ? "已完成" : "需要关注"} ·{" "}
                        {new Date(audit.createdAt).toLocaleString()}
                      </p>
                      <details className="mt-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">查看详情</summary>
                        <p className="mt-2">
                          变更前：{stateDetail(audit.beforeState)}
                        </p>
                        <p>变更后：{stateDetail(audit.afterState)}</p>
                      </details>
                    </div>
                    <Badge variant="outline">
                      {audit.resourceType === "payment" ? "支付" : "账务"}
                    </Badge>
                  </div>
                ))}
                {auditCursor ? (
                  <Button onClick={handleLoadMoreAudit} variant="outline">
                    查看更多记录
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
