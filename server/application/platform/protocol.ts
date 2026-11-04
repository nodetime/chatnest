import type { z } from "zod";
import type { ToolIdentity } from "@/server/domain/billing/types";
import type {
  AddOrganizationMemberRequest,
  AddOrganizationMemberResponse,
  AdminBillingOverview,
  AdminCapabilityResponse,
  ApprovalListResponse,
  ApprovalRequest,
  AuditExportResponse,
  AuditListResponse,
  AuditProjection,
  BillingApproval,
  BillingApprovalExecutionRequest,
  BillingApprovalExecutionResponse,
  CheckoutIntentResponse,
  CheckoutStatus,
  CreateOrganizationResponse,
  ExpireWalletGrantsResponse,
  PlatformPlan as GeneratedPlatformPlan,
  OperationDispatchResponse,
  OperationReserveResponse,
  Organization,
  OrganizationMembersResponse,
  OrganizationsResponse,
  PlansResponse,
  ReconcileRequest,
  ReconcileResponse,
  SessionDetailsResponse,
  SessionSummary,
  SessionsResponse,
  Subscription,
  SubscriptionsResponse,
  WalletAdjustmentRequest,
} from "./generated/types";
import type { platformQuerySchema } from "./generated/wire";

export type PlatformReserveInput = {
  attemptId: string;
  billingDimensions?: Record<string, boolean | number | string>;
  canonicalToolKey?: string;
  operationId: string;
  organizationId?: string;
  sessionGroupId?: string;
  runId?: string;
  stepIndex?: number;
  subjectType?: "model" | "tool";
  modelId?: string;
  subjectId: string;
  tool: ToolIdentity;
};

export type PlatformReserveResult = OperationReserveResponse;
export type PlatformDispatchResult = OperationDispatchResponse;

export type PlatformReportInput = {
  attemptId: string;
  executionReceipt?: unknown;
  operationId: string;
  outcome: "response" | "failed" | "unknown";
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export type PlatformSessionDetails = SessionDetailsResponse;

export type PlatformSessionSummary = SessionSummary;
export type PlatformSessionList = SessionsResponse;
export type PlatformPlan = GeneratedPlatformPlan;
export type PlatformPlanList = PlansResponse;
export type PlatformOrganization = Organization;
export type PlatformOrganizationList = OrganizationsResponse;
export type PlatformCheckoutIntent = CheckoutIntentResponse;
export type PlatformCheckoutStatus = CheckoutStatus;
export type PlatformSubscription = Subscription;
export type PlatformAdminOverview = AdminBillingOverview;

export type PlatformAdminOverviewFilters = z.output<
  ReturnType<typeof platformQuerySchema<"billingInternalAdminOverview">>
>;
type PlatformAuditFilters = Omit<
  z.output<ReturnType<typeof platformQuerySchema<"billingListBillingAudit">>>,
  "limit"
> & { limit?: number };

export type PlatformAdminCapability = AdminCapabilityResponse;
export type PlatformBillingApproval = BillingApproval;
export type PlatformAuditLog = AuditProjection;
export type PlatformReconciliationDecision = ReconcileRequest["decision"];

export interface PlatformBillingClient {
  addOrganizationMember?: (
    input: AddOrganizationMemberRequest & {
      organizationId: string;
    }
  ) => Promise<AddOrganizationMemberResponse>;
  adjustWallet?: (
    input: WalletAdjustmentRequest & {
      idempotencyKey: string;
      userId: string;
    }
  ) => Promise<{
    /** Balance immediately after this operation, not the current balance on replay. */
    balancePoints: string;
    duplicate?: boolean;
    idempotencyKey: string;
  }>;
  adminCapability?: () => Promise<PlatformAdminCapability>;
  adminOverview?: (
    filters?: PlatformAdminOverviewFilters
  ) => Promise<PlatformAdminOverview>;
  approveBillingApproval?: (
    approvalId: string
  ) => Promise<PlatformBillingApproval>;
  checkoutStatus?: (checkoutId: string) => Promise<PlatformCheckoutStatus>;
  createCheckoutIntent?: (input: {
    idempotencyKey: string;
    organizationId?: string;
    planSlug: string;
  }) => Promise<PlatformCheckoutIntent>;
  createOrganization?: (input: {
    name: string;
    slug?: string;
  }) => Promise<CreateOrganizationResponse>;
  dispatch: (input: {
    attemptId: string;
    operationId: string;
  }) => Promise<PlatformDispatchResult>;
  executeDisputeReview?: (
    input: BillingApprovalExecutionRequest
  ) => Promise<BillingApprovalExecutionResponse>;
  executeRefundRecovery?: (
    input: BillingApprovalExecutionRequest
  ) => Promise<BillingApprovalExecutionResponse>;
  expireWalletGrants?: () => Promise<ExpireWalletGrantsResponse>;
  listBillingApprovals?: (
    status?: PlatformBillingApproval["status"],
    cursor?: string,
    limit?: number
  ) => Promise<ApprovalListResponse>;
  listBillingAudit?: (
    input?: PlatformAuditFilters
  ) => Promise<AuditListResponse>;
  listOrganizationMembers?: (
    organizationId: string
  ) => Promise<OrganizationMembersResponse>;
  organizations?: () => Promise<PlatformOrganizationList>;
  plans?: (organizationId?: string) => Promise<PlatformPlanList>;
  reconcileOperation?: (
    input: ReconcileRequest & {
      operationId: string;
      revision: string;
    }
  ) => Promise<ReconcileResponse>;
  recordBillingAuditExport?: (input: {
    count: number;
    scope?: "billing";
  }) => Promise<AuditExportResponse>;
  report: (input: PlatformReportInput) => Promise<void>;
  reportInternal?: (input: PlatformReportInput) => Promise<void>;
  requestBillingApproval?: (
    input: ApprovalRequest
  ) => Promise<PlatformBillingApproval>;
  reserve: (input: PlatformReserveInput) => Promise<PlatformReserveResult>;
  sessionDetails?: (
    sessionGroupId: string,
    page?: { cursor?: string; limit?: number }
  ) => Promise<PlatformSessionDetails>;
  sessionList?: (organizationId?: string) => Promise<PlatformSessionList>;
  subscriptions?: (organizationId?: string) => Promise<SubscriptionsResponse>;
}
