import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  PLATFORM_API_VERSION,
  PLATFORM_SCHEMA_REVISION,
} from "./contract-version";
import {
  AddOrganizationMemberResponseSchema,
  AdminBillingOverviewSchema,
  AdminCapabilityResponseSchema,
  ApprovalListResponseSchema,
  ApprovalResponseSchema,
  AuditExportResponseSchema,
  AuditListResponseSchema,
  BillingApprovalExecutionResponseSchema,
  CheckoutIntentResponseSchema,
  CheckoutStatusSchema,
  CreateOrganizationResponseSchema,
  ExpireWalletGrantsResponseSchema,
  OperationDispatchResponseSchema,
  OperationReportResponseSchema,
  OperationReserveResponseSchema,
  OrganizationMembersResponseSchema,
  OrganizationsResponseSchema,
  PlansResponseSchema,
  ReconcileResponseSchema,
  SessionDetailsResponseSchema,
  SessionsResponseSchema,
  SubscriptionsResponseSchema,
  WalletAdjustmentResponseSchema,
} from "./generated/schemas";
import type {
  PlatformAdminCapability,
  PlatformAdminOverview,
  PlatformAdminOverviewFilters,
  PlatformBillingClient,
  PlatformDispatchResult,
  PlatformReportInput,
  PlatformReserveInput,
  PlatformReserveResult,
  PlatformSessionDetails,
  PlatformSessionList,
} from "./protocol";

export type PlatformClientOptions = {
  adminIdentity?: { issuer: string; subject: string };
  baseUrl: string;
  fetcher?: typeof fetch;
  serviceToken: string;
  userToken?: string;
  timeoutMs?: number;
};

export class PlatformHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`Platform request failed: ${status} ${code}`);
    this.name = "PlatformHttpError";
    this.status = status;
    this.code = code;
  }
}

export function platformFailure(
  error: unknown,
  fallbackCode: string
): { code: string; status: number } {
  if (error instanceof PlatformHttpError) {
    return {
      code: error.code,
      status: error.status >= 500 && error.status !== 503 ? 502 : error.status,
    };
  }
  return { code: fallbackCode, status: 502 };
}

export function platformResponseError(
  error: unknown,
  fallbackCode: string
): Response {
  const failure = platformFailure(error, fallbackCode);
  return Response.json({ code: failure.code }, { status: failure.status });
}

async function request<T>(
  options: PlatformClientOptions,
  method: string,
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  requestOptions?: { headers?: HeadersInit; internal?: boolean }
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 5000
  );
  try {
    const url = new URL(path, options.baseUrl);
    const response = await (options.fetcher ?? fetch)(url, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${options.serviceToken}`,
        "Content-Type": "application/json",
        "X-Platform-API-Version": PLATFORM_API_VERSION,
        "X-Platform-Schema-Revision": PLATFORM_SCHEMA_REVISION,
        ...(options.userToken
          ? { "X-Platform-User-Token": options.userToken }
          : {}),
        ...(options.adminIdentity
          ? {
              "X-Platform-Admin-Issuer": options.adminIdentity.issuer,
              "X-Platform-Admin-Subject": options.adminIdentity.subject,
            }
          : {}),
        ...(requestOptions?.internal ? { "X-Platform-Internal": "1" } : {}),
        ...(requestOptions?.headers ?? {}),
        "X-Request-Id": randomUUID(),
      },
      method,
      redirect: "error",
      signal: controller.signal,
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const code =
        payload && typeof payload === "object" && "code" in payload
          ? String((payload as { code: unknown }).code)
          : "PLATFORM_REQUEST_FAILED";
      throw new PlatformHttpError(response.status, code);
    }
    return schema.parse(payload);
  } finally {
    clearTimeout(timeout);
  }
}

export function createPlatformBillingClient(
  options: PlatformClientOptions
): PlatformBillingClient &
  Required<Pick<PlatformBillingClient, "executeDisputeReview">> {
  return {
    addOrganizationMember(input) {
      return request(
        options,
        "POST",
        `/api/platform/v1/organizations/${encodeURIComponent(input.organizationId)}/members`,
        { userId: input.userId },
        AddOrganizationMemberResponseSchema
      );
    },
    adjustWallet(input) {
      return request(
        options,
        "POST",
        `/api/platform/v1/admin/billing/wallets/${encodeURIComponent(input.userId)}/adjust`,
        {
          approvalId: input.approvalId,
          deltaPoints: input.deltaPoints,
          organizationId: input.organizationId,
          reason: input.reason,
        },
        WalletAdjustmentResponseSchema.transform((value) => ({
          balancePoints:
            "duplicate" in value
              ? value.entry.balanceAfter
              : value.balancePoints,
          duplicate: "duplicate" in value ? value.duplicate : undefined,
          idempotencyKey: value.idempotencyKey,
        })),
        { headers: { "Idempotency-Key": input.idempotencyKey }, internal: true }
      );
    },
    adminCapability(): Promise<PlatformAdminCapability> {
      return request(
        options,
        "GET",
        "/api/platform/v1/internal/admin/capability",
        undefined,
        AdminCapabilityResponseSchema,
        { internal: true }
      );
    },
    adminOverview(
      filters?: PlatformAdminOverviewFilters
    ): Promise<PlatformAdminOverview> {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(filters ?? {})) {
        if (value !== undefined) {
          query.set(key, String(value));
        }
      }
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return request(
        options,
        "GET",
        `/api/platform/v1/internal/admin/billing/overview${suffix}`,
        undefined,
        AdminBillingOverviewSchema,
        { internal: true }
      );
    },
    approveBillingApproval(approvalId) {
      return request(
        options,
        "POST",
        `/api/platform/v1/internal/admin/billing/approvals/${encodeURIComponent(approvalId)}/approve`,
        {},
        ApprovalResponseSchema.transform(({ approval }) => approval),
        { internal: true }
      );
    },
    checkoutStatus(checkoutId) {
      return request(
        options,
        "GET",
        `/api/platform/v1/payments/checkout/${encodeURIComponent(checkoutId)}`,
        undefined,
        CheckoutStatusSchema
      );
    },
    createCheckoutIntent(input) {
      return request(
        options,
        "POST",
        "/api/platform/v1/payments/checkout-intent",
        input,
        CheckoutIntentResponseSchema,
        { headers: { "Idempotency-Key": input.idempotencyKey } }
      );
    },
    createOrganization(input) {
      return request(
        options,
        "POST",
        "/api/platform/v1/organizations",
        input,
        CreateOrganizationResponseSchema
      );
    },
    dispatch(input): Promise<PlatformDispatchResult> {
      return request(
        options,
        "POST",
        `/api/platform/v1/operations/${encodeURIComponent(input.operationId)}/dispatch`,
        undefined,
        OperationDispatchResponseSchema
      );
    },
    executeDisputeReview(input) {
      return request(
        options,
        "POST",
        "/api/platform/v1/internal/admin/billing/dispute-reviews/execute",
        input,
        BillingApprovalExecutionResponseSchema,
        { internal: true }
      );
    },
    executeRefundRecovery(input) {
      return request(
        options,
        "POST",
        "/api/platform/v1/internal/admin/billing/refund-recoveries/execute",
        input,
        BillingApprovalExecutionResponseSchema,
        { internal: true }
      );
    },
    expireWalletGrants() {
      return request(
        options,
        "POST",
        "/api/platform/v1/internal/wallet-grants/expire",
        {},
        ExpireWalletGrantsResponseSchema,
        { internal: true }
      );
    },
    listBillingApprovals(status = "pending", cursor?: string, limit?: number) {
      const query = new URLSearchParams({
        limit: String(limit ?? 50),
        status,
      });
      if (cursor !== undefined) {
        query.set("cursor", cursor);
      }
      return request(
        options,
        "GET",
        `/api/platform/v1/internal/admin/billing/approvals?${query.toString()}`,
        undefined,
        ApprovalListResponseSchema,
        { internal: true }
      );
    },
    listBillingAudit(input = {}) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
          query.set(key, String(value));
        }
      }
      return request(
        options,
        "GET",
        `/api/platform/v1/internal/admin/billing/audit${query.size ? `?${query.toString()}` : ""}`,
        undefined,
        AuditListResponseSchema,
        { internal: true }
      );
    },
    listOrganizationMembers(organizationId) {
      return request(
        options,
        "GET",
        `/api/platform/v1/organizations/${encodeURIComponent(organizationId)}/members`,
        undefined,
        OrganizationMembersResponseSchema
      );
    },
    organizations() {
      return request(
        options,
        "GET",
        "/api/platform/v1/organizations",
        undefined,
        OrganizationsResponseSchema
      );
    },
    plans(organizationId) {
      const query =
        organizationId === undefined
          ? ""
          : `?organizationId=${encodeURIComponent(organizationId)}`;
      return request(
        options,
        "GET",
        `/api/platform/v1/plans${query}`,
        undefined,
        PlansResponseSchema
      );
    },
    reconcileOperation(input) {
      return request(
        options,
        "POST",
        `/api/platform/v1/admin/billing/operations/${encodeURIComponent(input.operationId)}/reconcile`,
        {
          approvalId: input.approvalId,
          decision: input.decision,
          reason: input.reason,
        },
        ReconcileResponseSchema,
        {
          headers: { "If-Match": input.revision },
          internal: true,
        }
      );
    },
    recordBillingAuditExport(input) {
      return request(
        options,
        "POST",
        "/api/platform/v1/internal/admin/billing/audit/export",
        input,
        AuditExportResponseSchema,
        { internal: true }
      );
    },
    async report(input) {
      await request(
        options,
        "POST",
        `/api/platform/v1/operations/${encodeURIComponent(input.operationId)}/report`,
        input,
        OperationReportResponseSchema
      );
    },
    reportInternal(input: PlatformReportInput): Promise<void> {
      return request(
        options,
        "POST",
        `/api/platform/v1/internal/operations/${encodeURIComponent(input.operationId)}/report`,
        input,
        OperationReportResponseSchema,
        { internal: true }
      ).then(() => undefined);
    },
    requestBillingApproval(input) {
      return request(
        options,
        "POST",
        "/api/platform/v1/internal/admin/billing/approvals",
        input,
        ApprovalResponseSchema.transform(({ approval }) => approval),
        { internal: true }
      );
    },
    reserve(input: PlatformReserveInput): Promise<PlatformReserveResult> {
      return request(
        options,
        "POST",
        "/api/platform/v1/operations/reserve",
        input,
        OperationReserveResponseSchema
      );
    },
    sessionDetails(
      sessionGroupId: string,
      page?: { cursor?: string; limit?: number }
    ): Promise<PlatformSessionDetails> {
      const query = new URLSearchParams();
      if (page?.cursor !== undefined) {
        query.set("cursor", page.cursor);
      }
      if (page?.limit !== undefined) {
        query.set("limit", String(page.limit));
      }
      return request(
        options,
        "GET",
        `/api/platform/v1/sessions/${encodeURIComponent(sessionGroupId)}${query.size ? `?${query}` : ""}`,
        undefined,
        SessionDetailsResponseSchema
      );
    },
    sessionList(organizationId?: string): Promise<PlatformSessionList> {
      const query =
        organizationId === undefined
          ? ""
          : `?organizationId=${encodeURIComponent(organizationId)}`;
      return request(
        options,
        "GET",
        `/api/platform/v1/sessions${query}`,
        undefined,
        SessionsResponseSchema
      );
    },
    subscriptions(organizationId) {
      const query =
        organizationId === undefined
          ? ""
          : `?organizationId=${encodeURIComponent(organizationId)}`;
      return request(
        options,
        "GET",
        `/api/platform/v1/subscriptions${query}`,
        undefined,
        SubscriptionsResponseSchema
      );
    },
  };
}
