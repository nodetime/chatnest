import type { AlertHistoryPage } from "@/server/shared/alert-history";
export type AlertSource<T> =
  | { status: "available"; checkedAt: string; data: T }
  | {
      status: "unavailable";
      checkedAt: string;
      data: null;
      reason: "read_failed" | "not_configured" | "invalid_response";
    };
export type SettlementHealth = {
  pending: number;
  processing: number;
  failed: number;
  deadLettered: number;
  oldestPendingAt: string | null;
};
export type PaymentHealth = {
  failed: number;
  received: number;
  processing: number;
  refundDue: number;
  inboxCount: number;
  webhookLagSeconds: number;
  successRate: number;
  completedSamples: number;
  caseRisk: { total: number; dueSoonOrOverdue: number; withGap: number };
  attention: Array<{
    createdAt: string;
    status: "failed" | "received" | "processing" | "refund_due" | "other";
  }>;
};
export type AlertsSnapshot = {
  checkedAt: string;
  settlement: AlertSource<SettlementHealth>;
  payment: AlertSource<PaymentHealth>;
  alertHistory: AlertSource<AlertHistoryPage>;
  delivery: {
    configurationSource: "application_environment";
    webhookConfigured: boolean;
    verification: "unknown";
    history: "not_connected" | "connected";
  };
};
