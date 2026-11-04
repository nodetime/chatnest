import {
  alertHistoryPageSchema,
  parseAlertHistoryCursor,
} from "@/server/shared/alert-history";
import "server-only";
import { z } from "zod";
import { AdminBillingOverviewSchema } from "@/server/application/platform/generated/schemas";
import type {
  AlertSource,
  AlertsSnapshot,
  PaymentHealth,
} from "@/server/domain/admin/alerts";

const count = z.number().int().nonnegative();
const healthSchema = z
  .object({
    deadLettered: count,
    failed: count,
    oldestPendingAt: z.iso.datetime({ offset: true }).nullable(),
    pending: count,
    processing: count,
  })
  .strict();
async function readSource<T>(
  read: (() => Promise<unknown>) | undefined,
  parse: (value: unknown) => T,
  now: () => Date
): Promise<AlertSource<T>> {
  if (!read) {
    return {
      checkedAt: now().toISOString(),
      data: null,
      reason: "not_configured",
      status: "unavailable",
    };
  }
  let value: unknown;
  try {
    value = await read();
  } catch {
    return {
      checkedAt: now().toISOString(),
      data: null,
      reason: "read_failed",
      status: "unavailable",
    };
  }
  try {
    return {
      checkedAt: now().toISOString(),
      data: parse(value),
      status: "available",
    };
  } catch {
    return {
      checkedAt: now().toISOString(),
      data: null,
      reason: "invalid_response",
      status: "unavailable",
    };
  }
}
function paymentProjection(value: unknown): PaymentHealth {
  const { payment, paymentAttention, paymentCases } =
    AdminBillingOverviewSchema.parse(value);
  return {
    // 不把 provider 的任意错误文本、金额、账号或内部标识带到告警摘要。
    attention: paymentAttention.map(({ createdAt, status }) => ({
      createdAt,
      status:
        status === "failed" ||
        status === "received" ||
        status === "processing" ||
        status === "refund_due"
          ? status
          : "other",
    })),
    caseRisk: {
      dueSoonOrOverdue: paymentCases.dueSoonOrOverdue,
      total: paymentCases.total,
      withGap: paymentCases.withGap,
    },
    completedSamples: payment.processed + payment.failed,
    failed: payment.failed,
    inboxCount: payment.inboxCount,
    processing: payment.processing,
    received: payment.received,
    refundDue: payment.refundDue,
    successRate: payment.successRate,
    webhookLagSeconds: payment.webhookLagSeconds,
  };
}
export function createAdminAlertsService({
  readSettlement,
  readPaymentOverview,
  webhookConfigured,
  readHistory,
  now = () => new Date(),
}: {
  readSettlement?: () => Promise<unknown> | undefined;
  readPaymentOverview?: (adminSubject: string) => Promise<unknown>;
  webhookConfigured: boolean;
  readHistory?: (historyCursor?: string) => Promise<unknown>;
  now?: () => Date;
}) {
  return {
    async snapshot({
      adminSubject,
      historyCursor,
    }: {
      adminSubject: string;
      historyCursor?: string;
    }): Promise<AlertsSnapshot> {
      const [settlement, payment, alertHistory] = await Promise.all([
        readSource(
          readSettlement ? async () => readSettlement() : undefined,
          (value) => healthSchema.parse(value),
          now
        ),
        readSource(
          readPaymentOverview
            ? () => readPaymentOverview(adminSubject)
            : undefined,
          paymentProjection,
          now
        ),
        readSource(
          readHistory ? () => readHistory(historyCursor) : undefined,
          (value) => alertHistoryPageSchema.parse(value),
          now
        ),
      ]);
      return {
        alertHistory,
        checkedAt: now().toISOString(),
        delivery: {
          configurationSource: "application_environment",
          history:
            alertHistory.status === "available" ? "connected" : "not_connected",
          verification: "unknown",
          webhookConfigured,
        },
        payment,
        settlement,
      };
    },
  };
}
type User = { id?: string; type?: string } | null | undefined;
export function createAlertsHandler({
  session,
  authorize,
  snapshot,
}: {
  session: () => Promise<User>;
  authorize: (user: User) => Promise<boolean>;
  snapshot: (input: {
    adminSubject: string;
    historyCursor?: string;
  }) => Promise<AlertsSnapshot>;
}) {
  return async (request: Request) => {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const user = await session();
      if (!user?.id || !(await authorize(user))) {
        return Response.json(
          { code: "ADMIN_REQUIRED" },
          { headers, status: 403 }
        );
      }
      let historyCursor: string | undefined;
      try {
        const params = new URL(request.url).searchParams;
        if (
          [...params.keys()].some((key) => key !== "historyCursor") ||
          params.getAll("historyCursor").length > 1
        ) {
          throw new Error("INVALID_QUERY");
        }
        if (params.has("historyCursor")) {
          historyCursor = params.get("historyCursor") as string;
          parseAlertHistoryCursor(historyCursor);
        }
      } catch {
        return Response.json(
          { code: "INVALID_HISTORY_CURSOR" },
          { headers, status: 400 }
        );
      }
      return Response.json(
        await snapshot({ adminSubject: user.id, historyCursor }),
        {
          headers,
        }
      );
    } catch {
      return Response.json(
        { code: "ALERTS_UNAVAILABLE" },
        { headers, status: 500 }
      );
    }
  };
}
