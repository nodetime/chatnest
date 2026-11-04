/** Generated operation-to-validator lookup. No authorization or side effects. */
import { z } from "zod";
import { platformRoute } from "./routes";
import {
  AddOrganizationMemberRequestSchema,
  AddOrganizationMemberResponseSchema,
  AdminBillingOverviewSchema,
  AdminCapabilityResponseSchema,
  ApprovalListResponseSchema,
  ApprovalRequestSchema,
  ApprovalResponseSchema,
  AuditExportRequestSchema,
  AuditExportResponseSchema,
  AuditListResponseSchema,
  BillingApprovalExecutionRequestSchema,
  BillingApprovalExecutionResponseSchema,
  CheckoutIntentRequestSchema,
  CheckoutIntentResponseSchema,
  CheckoutStatusSchema,
  CreateOrganizationRequestSchema,
  CreateOrganizationResponseSchema,
  ErrorSchema,
  ExpireWalletGrantsResponseSchema,
  IdentityDeactivateRequestSchema,
  IdentityDeactivateResponseSchema,
  IdentityExchangeRequestSchema,
  IdentityExchangeResponseSchema,
  OperationDispatchResponseSchema,
  OperationReportRequestSchema,
  OperationReportResponseSchema,
  OperationReserveRequestSchema,
  OperationReserveResponseSchema,
  OrganizationMembersResponseSchema,
  OrganizationsResponseSchema,
  PaymentErrorSchema,
  PaymentEventResponseSchema,
  PaymentReconcileRequestSchema,
  PaymentReconcileResponseSchema,
  PaymentReplayRequestSchema,
  PaymentReplayResponseSchema,
  PlansResponseSchema,
  PortaErrorSchema,
  PortaReceiptStatusResponseSchema,
  ProviderWebhookRequestSchema,
  ReconcileRequestSchema,
  ReconcileResponseSchema,
  SessionDetailsResponseSchema,
  SessionsResponseSchema,
  SubscriptionsResponseSchema,
  WalletAdjustmentRequestSchema,
  WalletAdjustmentResponseSchema,
} from "./schemas";

const validators: Record<string, z.ZodType> = {
  AddOrganizationMemberRequest: AddOrganizationMemberRequestSchema,
  AddOrganizationMemberResponse: AddOrganizationMemberResponseSchema,
  AdminBillingOverview: AdminBillingOverviewSchema,
  AdminCapabilityResponse: AdminCapabilityResponseSchema,
  ApprovalListResponse: ApprovalListResponseSchema,
  ApprovalRequest: ApprovalRequestSchema,
  ApprovalResponse: ApprovalResponseSchema,
  AuditExportRequest: AuditExportRequestSchema,
  AuditExportResponse: AuditExportResponseSchema,
  AuditListResponse: AuditListResponseSchema,
  BillingApprovalExecutionRequest: BillingApprovalExecutionRequestSchema,
  BillingApprovalExecutionResponse: BillingApprovalExecutionResponseSchema,
  CheckoutIntentRequest: CheckoutIntentRequestSchema,
  CheckoutIntentResponse: CheckoutIntentResponseSchema,
  CheckoutStatus: CheckoutStatusSchema,
  CreateOrganizationRequest: CreateOrganizationRequestSchema,
  CreateOrganizationResponse: CreateOrganizationResponseSchema,
  Error: ErrorSchema,
  ExpireWalletGrantsResponse: ExpireWalletGrantsResponseSchema,
  IdentityDeactivateRequest: IdentityDeactivateRequestSchema,
  IdentityDeactivateResponse: IdentityDeactivateResponseSchema,
  IdentityExchangeRequest: IdentityExchangeRequestSchema,
  IdentityExchangeResponse: IdentityExchangeResponseSchema,
  OperationDispatchResponse: OperationDispatchResponseSchema,
  OperationReportRequest: OperationReportRequestSchema,
  OperationReportResponse: OperationReportResponseSchema,
  OperationReserveRequest: OperationReserveRequestSchema,
  OperationReserveResponse: OperationReserveResponseSchema,
  OrganizationMembersResponse: OrganizationMembersResponseSchema,
  OrganizationsResponse: OrganizationsResponseSchema,
  PaymentError: PaymentErrorSchema,
  PaymentEventResponse: PaymentEventResponseSchema,
  PaymentReconcileRequest: PaymentReconcileRequestSchema,
  PaymentReconcileResponse: PaymentReconcileResponseSchema,
  PaymentReplayRequest: PaymentReplayRequestSchema,
  PaymentReplayResponse: PaymentReplayResponseSchema,
  PlansResponse: PlansResponseSchema,
  PortaError: PortaErrorSchema,
  PortaReceiptStatusResponse: PortaReceiptStatusResponseSchema,
  ProviderWebhookRequest: ProviderWebhookRequestSchema,
  ReconcileRequest: ReconcileRequestSchema,
  ReconcileResponse: ReconcileResponseSchema,
  SessionDetailsResponse: SessionDetailsResponseSchema,
  SessionsResponse: SessionsResponseSchema,
  SubscriptionsResponse: SubscriptionsResponseSchema,
  WalletAdjustmentRequest: WalletAdjustmentRequestSchema,
  WalletAdjustmentResponse: WalletAdjustmentResponseSchema,
};
type OperationId = Parameters<typeof platformRoute>[0];
const queryValidators = {
  billingAddOrganizationMember: z.object({}).strict(),
  billingAdminAdjustWallet: z.object({}).strict(),
  billingAdminOverview: z
    .object({
      cursor: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256)
        .regex(/^[A-Za-z0-9_-]+$/u)
        .optional(),
      from: z
        .union([
          z
            .string()
            .refine((value2) => [...value2].length <= 10)
            .regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u)
            .date(),
          z
            .string()
            .refine((value2) => [...value2].length <= 64)
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
        ])
        .optional(),
      limit: z
        .string()
        .regex(/^(?:0|-?[1-9][0-9]*)$/)
        .transform(Number)
        .pipe(z.number().refine(Number.isInteger).min(1).max(100))
        .optional(),
      state: z
        .intersection(
          z.string(),
          z.union([
            z.literal("reserved"),
            z.literal("dispatched"),
            z.literal("settled"),
            z.literal("released"),
            z.literal("reconcile_pending"),
            z.literal("overage_pending"),
          ])
        )
        .optional(),
      subjectType: z
        .intersection(
          z.string(),
          z.union([z.literal("model"), z.literal("tool")])
        )
        .optional(),
      to: z
        .union([
          z
            .string()
            .refine((value2) => [...value2].length <= 10)
            .regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u)
            .date(),
          z
            .string()
            .refine((value2) => [...value2].length <= 64)
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
        ])
        .optional(),
    })
    .strict(),
  billingApproveBillingApproval: z.object({}).strict(),
  billingCheckoutStatus: z.object({}).strict(),
  billingCreateCheckoutIntent: z.object({}).strict(),
  billingCreateOrganization: z.object({}).strict(),
  billingDetails: z
    .object({
      cursor: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 512)
        .regex(/^[A-Za-z0-9_-]+$/u)
        .optional(),
      limit: z
        .string()
        .regex(/^(?:0|-?[1-9][0-9]*)$/)
        .transform(Number)
        .pipe(z.number().refine(Number.isInteger).min(1).max(1000))
        .optional(),
    })
    .strict(),
  billingDispatch: z.object({}).strict(),
  billingExecuteDisputeReview: z.object({}).strict(),
  billingExecuteRefundRecovery: z.object({}).strict(),
  billingExpireWalletGrants: z.object({}).strict(),
  billingInternalAdminCapability: z.object({}).strict(),
  billingInternalAdminOverview: z
    .object({
      cursor: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256)
        .regex(/^[A-Za-z0-9_-]+$/u)
        .optional(),
      from: z
        .union([
          z
            .string()
            .refine((value2) => [...value2].length <= 10)
            .regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u)
            .date(),
          z
            .string()
            .refine((value2) => [...value2].length <= 64)
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
        ])
        .optional(),
      limit: z
        .string()
        .regex(/^(?:0|-?[1-9][0-9]*)$/)
        .transform(Number)
        .pipe(z.number().refine(Number.isInteger).min(1).max(100))
        .optional(),
      state: z
        .intersection(
          z.string(),
          z.union([
            z.literal("reserved"),
            z.literal("dispatched"),
            z.literal("settled"),
            z.literal("released"),
            z.literal("reconcile_pending"),
            z.literal("overage_pending"),
          ])
        )
        .optional(),
      subjectType: z
        .intersection(
          z.string(),
          z.union([z.literal("model"), z.literal("tool")])
        )
        .optional(),
      to: z
        .union([
          z
            .string()
            .refine((value2) => [...value2].length <= 10)
            .regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u)
            .date(),
          z
            .string()
            .refine((value2) => [...value2].length <= 64)
            .regex(
              /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u
            )
            .datetime({ offset: true }),
        ])
        .optional(),
    })
    .strict(),
  billingInternalReport: z.object({}).strict(),
  billingListBillingApprovals: z
    .object({
      cursor: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256)
        .regex(/^[A-Za-z0-9_-]+$/u)
        .optional(),
      limit: z
        .string()
        .regex(/^(?:[1-9]|[1-9][0-9]|100)$/u)
        .optional(),
      status: z
        .intersection(
          z.string(),
          z.union([
            z.literal("pending"),
            z.literal("approved"),
            z.literal("consumed"),
            z.literal("rejected"),
            z.literal("expired"),
          ])
        )
        .optional(),
    })
    .strict(),
  billingListBillingAudit: z
    .object({
      action: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256)
        .optional(),
      correlationId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256)
        .optional(),
      cursor: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256)
        .regex(/^[A-Za-z0-9_-]+$/u)
        .optional(),
      limit: z
        .string()
        .regex(/^(?:[1-9]|[1-9][0-9]|100)$/u)
        .optional(),
      resourceId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256)
        .optional(),
      resourceType: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256)
        .optional(),
      scope: z.intersection(z.string(), z.literal("billing")).optional(),
    })
    .strict(),
  billingListOrganizationMembers: z.object({}).strict(),
  billingListOrganizations: z.object({}).strict(),
  billingListPlans: z
    .object({
      organizationId: z
        .string()
        .regex(/^(?:|[1-9][0-9]{0,15})$/u)
        .optional(),
    })
    .strict(),
  billingListSessions: z
    .object({
      limit: z
        .string()
        .regex(/^(?:0|-?[1-9][0-9]*)$/)
        .transform(Number)
        .pipe(z.number().refine(Number.isInteger).min(1).max(100))
        .optional(),
      organizationId: z
        .string()
        .regex(/^(?:|[1-9][0-9]{0,15})$/u)
        .optional(),
    })
    .strict(),
  billingListSubscriptions: z
    .object({
      organizationId: z
        .string()
        .regex(/^(?:|[1-9][0-9]{0,15})$/u)
        .optional(),
    })
    .strict(),
  billingReconcileOperation: z.object({}).strict(),
  billingRecordBillingAuditExport: z.object({}).strict(),
  billingReport: z.object({}).strict(),
  billingRequestBillingApproval: z.object({}).strict(),
  billingReserve: z.object({}).strict(),
  identityDeactivateIdentity: z.object({}).strict(),
  identityExchangeIdentity: z.object({}).strict(),
  paymentPaymentWebhookHandler: z.object({}).strict(),
  paymentReconcilePaymentEvents: z.object({}).strict(),
  paymentReplayPaymentById: z.object({}).strict(),
  paymentReplayPaymentByProvider: z.object({}).strict(),
  portaReceiptStatus: z.object({}).strict(),
} as const;
export function platformQuerySchema<I extends OperationId>(
  id: I
): (typeof queryValidators)[I] {
  return queryValidators[id];
}
const pathValidators = {
  billingAddOrganizationMember: z
    .object({
      organizationId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 16)
        .regex(/^[1-9][0-9]{0,15}$/u),
    })
    .strict(),
  billingAdminAdjustWallet: z
    .object({
      userId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 64),
    })
    .strict(),
  billingAdminOverview: z.object({}).strict(),
  billingApproveBillingApproval: z
    .object({
      approvalId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 128),
    })
    .strict(),
  billingCheckoutStatus: z
    .object({
      checkoutId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256),
    })
    .strict(),
  billingCreateCheckoutIntent: z.object({}).strict(),
  billingCreateOrganization: z.object({}).strict(),
  billingDetails: z
    .object({
      sessionGroupId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 256),
    })
    .strict(),
  billingDispatch: z
    .object({
      operationId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 128),
    })
    .strict(),
  billingExecuteDisputeReview: z.object({}).strict(),
  billingExecuteRefundRecovery: z.object({}).strict(),
  billingExpireWalletGrants: z.object({}).strict(),
  billingInternalAdminCapability: z.object({}).strict(),
  billingInternalAdminOverview: z.object({}).strict(),
  billingInternalReport: z
    .object({
      operationId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 128),
    })
    .strict(),
  billingListBillingApprovals: z.object({}).strict(),
  billingListBillingAudit: z.object({}).strict(),
  billingListOrganizationMembers: z
    .object({
      organizationId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 16)
        .regex(/^[1-9][0-9]{0,15}$/u),
    })
    .strict(),
  billingListOrganizations: z.object({}).strict(),
  billingListPlans: z.object({}).strict(),
  billingListSessions: z.object({}).strict(),
  billingListSubscriptions: z.object({}).strict(),
  billingReconcileOperation: z
    .object({
      operationId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 128),
    })
    .strict(),
  billingRecordBillingAuditExport: z.object({}).strict(),
  billingReport: z
    .object({
      operationId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 128),
    })
    .strict(),
  billingRequestBillingApproval: z.object({}).strict(),
  billingReserve: z.object({}).strict(),
  identityDeactivateIdentity: z.object({}).strict(),
  identityExchangeIdentity: z.object({}).strict(),
  paymentPaymentWebhookHandler: z
    .object({
      provider: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 128),
    })
    .strict(),
  paymentReconcilePaymentEvents: z.object({}).strict(),
  paymentReplayPaymentById: z
    .object({
      eventId: z
        .string()
        .refine((value0) => [...value0].length >= 1)
        .refine((value0) => [...value0].length <= 10)
        .regex(/^[1-9][0-9]{0,9}$/u),
    })
    .strict(),
  paymentReplayPaymentByProvider: z.object({}).strict(),
  portaReceiptStatus: z
    .object({
      attemptId: z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .regex(
          // biome-ignore lint/suspicious/noControlCharactersInRegex: Canonical input deliberately rejects NUL.
          /^(?!\.{1,2}(?![\s\S]))[^\u0000\uD800-\uDFFF]+$/u
        ),
    })
    .strict(),
} as const;
export function platformPathSchema<I extends OperationId>(
  id: I
): (typeof pathValidators)[I] {
  return pathValidators[id];
}
const headerValidators = {
  billingAddOrganizationMember: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingAdminAdjustWallet: z
    .object({
      "idempotency-key": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .regex(/^[\x21-\x7e]+$/u)
        .optional(),
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingAdminOverview: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingApproveBillingApproval: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingCheckoutStatus: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingCreateCheckoutIntent: z
    .object({
      "idempotency-key": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .regex(/^[\x21-\x7e]+$/u)
        .optional(),
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingCreateOrganization: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingDetails: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingDispatch: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingExecuteDisputeReview: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingExecuteRefundRecovery: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingExpireWalletGrants: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingInternalAdminCapability: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingInternalAdminOverview: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingInternalReport: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingListBillingApprovals: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingListBillingAudit: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingListOrganizationMembers: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingListOrganizations: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingListPlans: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingListSessions: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingListSubscriptions: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingReconcileOperation: z
    .object({
      "if-match": z.string().refine((value0) => [...value0].length >= 1),
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingRecordBillingAuditExport: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingReport: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingRequestBillingApproval: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  billingReserve: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  identityDeactivateIdentity: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  identityExchangeIdentity: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  paymentPaymentWebhookHandler: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  paymentReconcilePaymentEvents: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  paymentReplayPaymentById: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  paymentReplayPaymentByProvider: z
    .object({
      "x-request-id": z
        .string()
        .refine((value1) => [...value1].length >= 1)
        .refine((value1) => [...value1].length <= 128)
        .optional(),
    })
    .strict(),
  portaReceiptStatus: z.object({}).strict(),
} as const;
export function platformHeaderSchema<I extends OperationId>(
  id: I
): (typeof headerValidators)[I] {
  return headerValidators[id];
}
export function platformBodySchema(id: OperationId): z.ZodType | null {
  const route = platformRoute(id);
  return route.bodySchema ? validators[route.bodySchema] : null;
}
export function platformResponseSchema(
  id: OperationId,
  status: number
): z.ZodType {
  const route = platformRoute(id);
  const responses: Readonly<Record<string, string>> = route.responses;
  const name = responses[String(status)];
  if (!name || !validators[name]) {
    throw new Error("CONTRACT_UNDECLARED_RESPONSE_STATUS");
  }
  return validators[name];
}
