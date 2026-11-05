/** Generated from platform-points/source.json + manifest.json. Do not edit. */
export type AdminPaymentAttention = {
  amountCents: number | null;
  createdAt: string;
  currency: string | null;
  eventType: string;
  failureReason: string | null;
  status: "failed" | "received" | "processing" | "refund_due";
  paymentEventId: number;
};
export type AdminBillingOverview = {
  adminRole: "admin" | "operator";
  adminId?: number;
  balancePoints: string | null;
  capturedPoints: string;
  nextCursor: string | null;
  operationCount: number;
  organizationBalancePoints: string | null;
  organizationWalletCount?: number;
  payment: {
    failed: number;
    ignored: number;
    inboxCount: number;
    processed: number;
    processing: number;
    received: number;
    refundDue: number;
    successRate: number;
    webhookLagSeconds: number;
  };
  paymentAttention: {
    amountCents: number | null;
    createdAt: string;
    currency: string | null;
    eventType: string;
    failureReason: string | null;
    status: "failed" | "received" | "processing" | "refund_due";
    paymentEventId: number;
  }[];
  paymentCases: {
    total: number;
    dueSoonOrOverdue: number;
    withGap: number;
    items: {
      sourcePaymentEventId: number;
      checkoutId: string;
      caseCount: number;
      dueAt: string | null;
      reviewRequired: boolean;
      disputedPoints: string;
      refundGapPoints: string;
      disputeGapPoints: string;
    }[];
  };
  personalBalancePoints: string | null;
  policyCount: number;
  recentOperations: {
    attemptId: string;
    canonicalToolKey: string;
    capturedPoints: string;
    createdAt: string;
    operationId: string;
    reservedPoints: string;
    sessionGroupId: string;
    state:
      | "reserved"
      | "dispatched"
      | "settled"
      | "released"
      | "reconcile_pending"
      | "overage_pending";
    subjectType: "model" | "tool";
    updatedAt: string;
  }[];
  reconcilePending: number;
  states: { [key: string]: number };
  requestId?: string;
  walletAccounting: {
    active: number;
    staged: number;
    frozen: number;
    missing: number;
    invalid: number;
  };
};
export type IdentityExchangeRequest = {
  audience: "platform-billing";
  issuer: string;
  subject: string;
  displayName?: string;
};
export type OperationReserveRequest = {
  operationId: string;
  attemptId: string;
  sessionGroupId: string;
  stepIndex?: number;
  subjectType: "model" | "tool";
  subjectId?: string;
  canonicalToolKey?: string;
  modelId?: string;
  billingDimensions?: { [key: string]: unknown };
  policyRevision?: string;
  organizationId?: string | number | null;
  runId?: string;
  tool?: { provider: string; platform: string; api: string };
};
export type OperationReserveResponse = {
  holdId: string;
  priceVersion?: string;
  reservedPoints: string;
  requestId?: string;
};
export type OperationDispatchResponse = { permit: string; requestId?: string };
export type OperationReportRequest = {
  operationId: string;
  attemptId: string;
  outcome: "response" | "failed" | "unknown" | "not_dispatched";
  usage?: { inputTokens?: number; outputTokens?: number } | null;
  executionReceipt?: {
    receiptId: string;
    operationId: string;
    attemptId: string;
    canonicalToolKey: string;
    dispatchEvidence: "not_dispatched" | "started" | "response" | "unknown";
    outcome:
      | "response"
      | "timeout"
      | "cancelled"
      | "network_error"
      | "response_too_large";
    httpStatus: number | null;
    supplierUnits: { [key: string]: string };
    receiptRevision: number;
    signature?: string;
  } | null;
};
export type ExecutionReceipt = {
  receiptId: string;
  operationId: string;
  attemptId: string;
  canonicalToolKey: string;
  dispatchEvidence: "not_dispatched" | "started" | "response" | "unknown";
  outcome:
    | "response"
    | "timeout"
    | "cancelled"
    | "network_error"
    | "response_too_large";
  httpStatus: number | null;
  supplierUnits: { [key: string]: string };
  receiptRevision: number;
  signature?: string;
};
export type OperationReportResponse = {
  state: "settled" | "reconcile_pending" | "released" | "overage_pending";
  requestId?: string;
};
export type CheckoutStatus = {
  refundAttention: "none" | "pending" | "review_required";
  paymentPosition: {
    reviewRequired: boolean;
    spendablePoints: string;
    restrictedPoints: string;
    heldPoints: string;
    consumedPoints: string;
    expiredPoints: string;
    disputedPoints: string;
  } | null;
  checkoutId: string;
  status:
    | "created"
    | "pending"
    | "completed"
    | "failed"
    | "expired"
    | "canceled"
    | "partially_refunded"
    | "refunded";
  organizationId: number | null;
  amountCents: number;
  currency: string;
  priceVersion: string | null;
  creditedPoints: string;
  refundedPoints: string;
  plan: { slug: string; name: string; monthlyPoints: string } | null;
  createdAt: string;
  updatedAt: string;
  requestId: string;
  refundRecovery: {
    decisions: number;
    recoveredPoints: string;
    availablePoints: string;
    expiredPoints: string;
  } | null;
};
export type CheckoutPointAmount = string;
export type PaymentWebhook = {
  eventType: string;
  amountCents?: number;
  currency?: string;
  userId?: number;
  organizationId?: number;
  checkoutId?: string;
  refundId?: string;
  providerAccount?: string;
  signature?: string;
  occurredAt?: string;
  expiresAt?: string;
  providerEventId: string;
  points?: string | number;
  refundedGrantPoints?: string | number;
  grossAmountMinor?: number;
  refundAmountMinor?: number;
  customerRef?: string;
  subscriptionId?: string;
  planSlug?: string;
  status?: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  metadata?: { [key: string]: unknown };
};
export type Error = {
  code: string;
  message: string;
  requestId: string;
  retryable?: boolean;
  details?: { [key: string]: unknown };
};
export type BillingOperation = {
  operationId: string;
  attemptId: string;
  sessionGroupId?: string;
  stepIndex?: number;
  subjectType?: "model" | "tool";
  canonicalToolKey?: string;
  modelId?: string | null;
  holdId?: string;
  state:
    | "reserved"
    | "dispatched"
    | "settled"
    | "released"
    | "reconcile_pending"
    | "overage_pending";
  priceVersion: string;
  reservedPoints: string;
  capturedPoints?: string;
  releasedPoints?: string;
  policyRevision?: string;
  outcome?: string | null;
  receiptId?: string | null;
  usage?: { inputTokens?: number; outputTokens?: number } | null;
};
export type NormalizedPaymentEvent = {
  provider: string;
  eventId: string;
  eventType: string;
  amountCents?: number;
  currency?: string;
  userId?: number;
  organizationId?: number;
  checkoutId?: string;
  refundId?: string;
  providerPaymentId?: string;
  providerAccount?: string;
  signature?: string;
  points?: string;
  occurredAt?: string;
  expiresAt?: string;
  subscription?: {
    subscriptionId: string;
    planSlug: string;
    status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    metadata?: { [key: string]: unknown };
  };
  refund?: {
    chargeId: string;
    state: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
    amountMinor: number;
  };
};
export type ExecutionPermit = {
  protocolVersion: "v1";
  platformId: string;
  deploymentId: string;
  operationId: string;
  attemptId: string;
  canonicalToolKey: string;
  priceVersion: string;
  reservedPoints: string;
  chargeMode: "attempt" | "success";
  keyId: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
};
export type PlanSummary = { slug: string; name: string; monthlyPoints: string };
export type PlatformPlan = {
  slug: string;
  name: string;
  monthlyPoints: string;
  priceCents: number;
  currency: string;
  priceVersion: string | null;
  active: boolean;
};
export type PlansResponse = {
  balancePoints: string;
  spendablePoints: string;
  restrictedPoints: string;
  currency: "USD";
  plans: {
    slug: string;
    name: string;
    monthlyPoints: string;
    priceCents: number;
    currency: string;
    priceVersion: string | null;
    active: boolean;
  }[];
  organizationId: number | null;
  requestId: string;
};
export type Subscription = {
  subscriptionId: string;
  provider: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  plan: { slug: string; name: string; monthlyPoints: string } | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};
export type SubscriptionsResponse = {
  organizationId: number | null;
  subscriptions: {
    subscriptionId: string;
    provider: string;
    status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
    plan: { slug: string; name: string; monthlyPoints: string } | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  }[];
  requestId: string;
};
export type CheckoutIntentRequest = {
  planSlug: string;
  organizationId?: string | number | null;
  idempotencyKey?: string;
};
export type CheckoutIntentResponse = {
  checkoutId: string;
  checkoutUrl: string;
  organizationId: number | null;
  plan: {
    slug: string;
    name: string;
    monthlyPoints: string;
    priceCents: number;
    currency: string;
    priceVersion: string | null;
    active: boolean;
  };
  requestId: string;
};
export type Organization = {
  id: number;
  name: string;
  slug: string;
  status: "active";
  role: "owner" | "admin" | "member";
  balancePoints: string;
};
export type OrganizationsResponse = {
  organizations: {
    id: number;
    name: string;
    slug: string;
    status: "active";
    role: "owner" | "admin" | "member";
    balancePoints: string;
  }[];
  requestId: string;
};
export type CreateOrganizationRequest = { name: string; slug?: string };
export type CreateOrganizationResponse = {
  organization: {
    id: number;
    name: string;
    slug: string;
    status: "active";
    role: "owner" | "admin" | "member";
    balancePoints: string;
  };
  requestId: string;
};
export type OrganizationMember = {
  userId: number;
  name: string | null;
  email: string | null;
  role: "owner" | "admin" | "member";
  active: boolean;
};
export type OrganizationMembersResponse = {
  members: {
    userId: number;
    name: string | null;
    email: string | null;
    role: "owner" | "admin" | "member";
    active: boolean;
  }[];
  requestId: string;
};
export type AddOrganizationMemberRequest = { userId: string | number };
export type AddOrganizationMemberResponse = {
  member: { userId: number; role: "member"; active: true };
  requestId: string;
};
export type SessionSummary = {
  sessionGroupId: string;
  chatId: string;
  organizationId: number | null;
  runId: string | null;
  status: "active" | "completed" | "reconcile_pending" | "overage_pending";
  stepsCount: number;
  reservedPoints: string;
  capturedPoints: string;
  createdAt: string;
};
export type SessionsResponse = {
  balancePoints: string;
  sessions: {
    sessionGroupId: string;
    chatId: string;
    organizationId: number | null;
    runId: string | null;
    status: "active" | "completed" | "reconcile_pending" | "overage_pending";
    stepsCount: number;
    reservedPoints: string;
    capturedPoints: string;
    createdAt: string;
  }[];
  requestId: string;
};
export type PublicExecutionReceipt = {
  dispatchEvidence: string | null;
  httpStatus: number | null;
  outcome: string | null;
  receiptId: string | null;
  receiptRevision: number | null;
  supplierUnits?: { [key: string]: string };
};
export type SessionStep = {
  operationId: string;
  attemptId: string;
  subjectType: "model" | "tool";
  canonicalToolKey: string;
  modelId: string | null;
  stepIndex: number | null;
  state:
    | "reserved"
    | "dispatched"
    | "settled"
    | "released"
    | "reconcile_pending"
    | "overage_pending";
  reservedPoints: string;
  capturedPoints: string;
  outcome: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  executionReceipt: {
    dispatchEvidence: string | null;
    httpStatus: number | null;
    outcome: string | null;
    receiptId: string | null;
    receiptRevision: number | null;
    supplierUnits?: { [key: string]: string };
  } | null;
  createdAt: string;
  updatedAt: string;
};
export type SessionDetailsResponse = {
  session: {
    sessionGroupId: string;
    chatId: string;
    runId: string | null;
    organizationId: number | null;
    status: "active" | "completed" | "reconcile_pending" | "overage_pending";
  };
  totals: { reservedPoints: string; capturedPoints: string };
  steps: {
    operationId: string;
    attemptId: string;
    subjectType: "model" | "tool";
    canonicalToolKey: string;
    modelId: string | null;
    stepIndex: number | null;
    state:
      | "reserved"
      | "dispatched"
      | "settled"
      | "released"
      | "reconcile_pending"
      | "overage_pending";
    reservedPoints: string;
    capturedPoints: string;
    outcome: string | null;
    usage: { inputTokens: number; outputTokens: number } | null;
    executionReceipt: {
      dispatchEvidence: string | null;
      httpStatus: number | null;
      outcome: string | null;
      receiptId: string | null;
      receiptRevision: number | null;
      supplierUnits?: { [key: string]: string };
    } | null;
    createdAt: string;
    updatedAt: string;
  }[];
  requestId: string;
  page: {
    limit: number;
    hasMore: boolean;
    totalSteps: number;
    nextCursor: string | null;
  };
};
export type ExpireWalletGrantsResponse = { expired: number; requestId: string };
export type IdentityExchangeResponse = {
  token: string;
  expiresAt: string;
  issuer: string;
  subject: string;
  audience: "platform-billing";
  scope: "platform:billing"[];
  requestId: string;
};
export type IdentityDeactivateRequest = { issuer: string; subject: string };
export type IdentityDeactivateResponse = {
  deactivated: boolean;
  requestId: string;
};
export type AdminCapabilityResponse = {
  adminId: number;
  allowed: true;
  role: "admin" | "operator";
  requestId: string;
};
export type AuditProjection = {
  id: number;
  action: string;
  actorId: number | null;
  actorIssuer: string | null;
  actorSubject: string | null;
  beforeState: { [key: string]: unknown } | null;
  afterState: { [key: string]: unknown } | null;
  correlationId: string;
  createdAt: string;
  ipAddress: string | null;
  requestId: string;
  resourceId: string | null;
  resourceType: string;
  result: string;
  summary: { [key: string]: unknown } | null;
  updatedAt: string;
  userAgent: string | null;
};
export type AuditListResponse = {
  audits: {
    id: number;
    action: string;
    actorId: number | null;
    actorIssuer: string | null;
    actorSubject: string | null;
    beforeState: { [key: string]: unknown } | null;
    afterState: { [key: string]: unknown } | null;
    correlationId: string;
    createdAt: string;
    ipAddress: string | null;
    requestId: string;
    resourceId: string | null;
    resourceType: string;
    result: string;
    summary: { [key: string]: unknown } | null;
    updatedAt: string;
    userAgent: string | null;
  }[];
  hasMore: boolean;
  nextCursor: string | null;
  viewerAdminId: number;
  requestId: string;
};
export type AuditExportRequest = { count?: number; scope?: string };
export type AuditExportResponse = {
  recorded: true;
  count: number;
  requestId: string;
};
export type BillingApproval = {
  approvalId: string;
  action: "reconcile" | "wallet_adjust" | "refund_recovery" | "dispute_review";
  resourceId: string;
  decision: string | null;
  mutationHash: string | null;
  requestedRevision: string;
  reason: string;
  requestedBy: number;
  approvedBy: number | null;
  status: "pending" | "approved" | "consumed" | "rejected" | "expired";
  expiresAt: string;
  approvedAt: string | null;
  consumedAt: string | null;
  deltaPoints: string | null;
  organizationId: number | null;
  recoverySnapshot: {
    paymentEventId: number;
    refundEventId: number;
    checkoutIntentId: number;
    grantId: number;
    accountId: number;
    userId: number;
    checkoutId: string;
    providerPaymentId: string;
    chargeId: string;
    refundId: string;
    failureBalanceTransactionId: string;
    originalBalanceTransactionId: string;
    organizationId: number | null;
    providerAccount: string | null;
    currency: string;
    livemode: boolean;
    amountMinor: string;
    capturedMinor: string;
    grossRefundMinor: string;
    priorRecoveryMinor: string;
    targetBeforePoints: string;
    targetAfterPoints: string;
    recoveredPoints: string;
    availablePoints: string;
    expiredPoints: string;
    expiredAvailablePoints: string;
    walletDeltaPoints: string;
    originalExpiresAt: string | null;
    walletVersion: number;
    grantVersion: number;
    checkoutRevision: string;
    coveredEvents: { id: number; payloadHash: string }[];
    factSetHash: string;
    providerEvidenceHash: string;
    providerState: "failed" | "canceled";
    failureReason: string;
    disposition: "customer_elected_original_entitlement";
    customerResolutionReference: string;
    evidenceRetrievedAt: string;
    providerRequestId: string | null;
    lossPosition: {
      disputeTargetBeforePoints: string;
      disputeTargetAfterPoints: string;
      refundFundedAfterPoints: string;
      disputeFundedAfterPoints: string;
      refundGapAfterPoints: string;
      disputeGapAfterPoints: string;
      transferredToDisputePoints: string;
      reviewRequired: boolean;
      movements: {
        from: "available" | "refunded" | "disputed" | "expired";
        to: "available" | "refunded" | "disputed" | "expired";
        points: string;
      }[];
    } | null;
  } | null;
  disputeReviewSnapshot: {
    sourcePaymentEventId: number;
    coverageHash: string;
    caseCount: number;
    checkoutId: string;
    checkoutIntentId: number;
    grantId: number;
    organizationId: number | null;
    grantVersion: number;
    refundTargetPoints: string;
    disputeTargetPoints: string;
    spendablePoints: string;
    evidenceReference: string;
    expiresAt: string | null;
  } | null;
};
export type ApprovalListResponse = {
  approvals: {
    approvalId: string;
    action:
      | "reconcile"
      | "wallet_adjust"
      | "refund_recovery"
      | "dispute_review";
    resourceId: string;
    decision: string | null;
    mutationHash: string | null;
    requestedRevision: string;
    reason: string;
    requestedBy: number;
    approvedBy: number | null;
    status: "pending" | "approved" | "consumed" | "rejected" | "expired";
    expiresAt: string;
    approvedAt: string | null;
    consumedAt: string | null;
    deltaPoints: string | null;
    organizationId: number | null;
    recoverySnapshot: {
      paymentEventId: number;
      refundEventId: number;
      checkoutIntentId: number;
      grantId: number;
      accountId: number;
      userId: number;
      checkoutId: string;
      providerPaymentId: string;
      chargeId: string;
      refundId: string;
      failureBalanceTransactionId: string;
      originalBalanceTransactionId: string;
      organizationId: number | null;
      providerAccount: string | null;
      currency: string;
      livemode: boolean;
      amountMinor: string;
      capturedMinor: string;
      grossRefundMinor: string;
      priorRecoveryMinor: string;
      targetBeforePoints: string;
      targetAfterPoints: string;
      recoveredPoints: string;
      availablePoints: string;
      expiredPoints: string;
      expiredAvailablePoints: string;
      walletDeltaPoints: string;
      originalExpiresAt: string | null;
      walletVersion: number;
      grantVersion: number;
      checkoutRevision: string;
      coveredEvents: { id: number; payloadHash: string }[];
      factSetHash: string;
      providerEvidenceHash: string;
      providerState: "failed" | "canceled";
      failureReason: string;
      disposition: "customer_elected_original_entitlement";
      customerResolutionReference: string;
      evidenceRetrievedAt: string;
      providerRequestId: string | null;
      lossPosition: {
        disputeTargetBeforePoints: string;
        disputeTargetAfterPoints: string;
        refundFundedAfterPoints: string;
        disputeFundedAfterPoints: string;
        refundGapAfterPoints: string;
        disputeGapAfterPoints: string;
        transferredToDisputePoints: string;
        reviewRequired: boolean;
        movements: {
          from: "available" | "refunded" | "disputed" | "expired";
          to: "available" | "refunded" | "disputed" | "expired";
          points: string;
        }[];
      } | null;
    } | null;
    disputeReviewSnapshot: {
      sourcePaymentEventId: number;
      coverageHash: string;
      caseCount: number;
      checkoutId: string;
      checkoutIntentId: number;
      grantId: number;
      organizationId: number | null;
      grantVersion: number;
      refundTargetPoints: string;
      disputeTargetPoints: string;
      spendablePoints: string;
      evidenceReference: string;
      expiresAt: string | null;
    } | null;
  }[];
  hasMore: boolean;
  nextCursor: string | null;
  viewerAdminId: number;
  requestId: string;
};
export type ApprovalResponse = {
  approval: {
    approvalId: string;
    action:
      | "reconcile"
      | "wallet_adjust"
      | "refund_recovery"
      | "dispute_review";
    resourceId: string;
    decision: string | null;
    mutationHash: string | null;
    requestedRevision: string;
    reason: string;
    requestedBy: number;
    approvedBy: number | null;
    status: "pending" | "approved" | "consumed" | "rejected" | "expired";
    expiresAt: string;
    approvedAt: string | null;
    consumedAt: string | null;
    deltaPoints: string | null;
    organizationId: number | null;
    recoverySnapshot: {
      paymentEventId: number;
      refundEventId: number;
      checkoutIntentId: number;
      grantId: number;
      accountId: number;
      userId: number;
      checkoutId: string;
      providerPaymentId: string;
      chargeId: string;
      refundId: string;
      failureBalanceTransactionId: string;
      originalBalanceTransactionId: string;
      organizationId: number | null;
      providerAccount: string | null;
      currency: string;
      livemode: boolean;
      amountMinor: string;
      capturedMinor: string;
      grossRefundMinor: string;
      priorRecoveryMinor: string;
      targetBeforePoints: string;
      targetAfterPoints: string;
      recoveredPoints: string;
      availablePoints: string;
      expiredPoints: string;
      expiredAvailablePoints: string;
      walletDeltaPoints: string;
      originalExpiresAt: string | null;
      walletVersion: number;
      grantVersion: number;
      checkoutRevision: string;
      coveredEvents: { id: number; payloadHash: string }[];
      factSetHash: string;
      providerEvidenceHash: string;
      providerState: "failed" | "canceled";
      failureReason: string;
      disposition: "customer_elected_original_entitlement";
      customerResolutionReference: string;
      evidenceRetrievedAt: string;
      providerRequestId: string | null;
      lossPosition: {
        disputeTargetBeforePoints: string;
        disputeTargetAfterPoints: string;
        refundFundedAfterPoints: string;
        disputeFundedAfterPoints: string;
        refundGapAfterPoints: string;
        disputeGapAfterPoints: string;
        transferredToDisputePoints: string;
        reviewRequired: boolean;
        movements: {
          from: "available" | "refunded" | "disputed" | "expired";
          to: "available" | "refunded" | "disputed" | "expired";
          points: string;
        }[];
      } | null;
    } | null;
    disputeReviewSnapshot: {
      sourcePaymentEventId: number;
      coverageHash: string;
      caseCount: number;
      checkoutId: string;
      checkoutIntentId: number;
      grantId: number;
      organizationId: number | null;
      grantVersion: number;
      refundTargetPoints: string;
      disputeTargetPoints: string;
      spendablePoints: string;
      evidenceReference: string;
      expiresAt: string | null;
    } | null;
  };
  requestId: string;
};
export type ApprovalRequest =
  | {
      action: "reconcile";
      resourceId: string;
      revision: string;
      reason: string;
      decision: "capture_reserved" | "release_reserved" | "charge_overage";
    }
  | {
      action: "wallet_adjust";
      resourceId: string;
      reason: string;
      deltaPoints: string | number;
      organizationId?: string | number | null;
    }
  | {
      action: "refund_recovery";
      resourceId: string;
      reason: string;
      disposition: "customer_elected_original_entitlement";
      customerResolutionReference: string;
    }
  | {
      action: "dispute_review";
      resourceId: string;
      reason: string;
      evidenceReference: string;
    };
export type ReconcileRequest = {
  decision: "capture_reserved" | "release_reserved" | "charge_overage";
  approvalId?: string;
  reason?: string;
};
export type ReconcileResponse = {
  operationId: string;
  decision: "capture_reserved" | "release_reserved" | "charge_overage";
  state: "settled" | "released";
  capturedPoints: string;
  requestId: string;
};
export type WalletAdjustmentRequest = {
  deltaPoints: string | number;
  reason: string;
  organizationId?: string | number | null;
  idempotencyKey?: string;
  approvalId?: string;
};
export type WalletAdjustmentEntry = {
  id: number;
  operationId: string;
  sessionGroupId: string;
  user: number;
  organization: number | null;
  eventType: "adjustment";
  deltaPoints: string;
  balanceAfter: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};
export type WalletAdjustmentResponse =
  | {
      idempotencyKey: string;
      balancePoints: string;
      entry: {
        id: number;
        operationId: string;
        sessionGroupId: string;
        user: number;
        organization: number | null;
        eventType: "adjustment";
        deltaPoints: string;
        balanceAfter: string;
        idempotencyKey: string;
        createdAt: string;
        updatedAt: string;
      };
      requestId: string;
    }
  | {
      idempotencyKey: string;
      duplicate: true;
      entry: {
        id: number;
        operationId: string;
        sessionGroupId: string;
        user: number;
        organization: number | null;
        eventType: "adjustment";
        deltaPoints: string;
        balanceAfter: string;
        idempotencyKey: string;
        createdAt: string;
        updatedAt: string;
      };
      requestId: string;
    };
export type PaymentEventResponse =
  | { status: "processed" | "ignored"; eventId: string }
  | {
      status: "processed";
      eventId: string;
      paymentId: number;
      subscriptionId: string;
      subscriptionStatus:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete";
    }
  | { status: "ignored"; eventId: string; paymentId: number; reason: string }
  | {
      status: "processed";
      eventId: string;
      paymentId: number;
      organizationId: number | null;
      balancePoints: string;
    };
export type PaymentReplayResponse =
  | (
      | { status: "processed" | "ignored"; eventId: string }
      | {
          status: "processed";
          eventId: string;
          paymentId: number;
          subscriptionId: string;
          subscriptionStatus:
            | "trialing"
            | "active"
            | "past_due"
            | "canceled"
            | "incomplete";
        }
      | {
          status: "ignored";
          eventId: string;
          paymentId: number;
          reason: string;
        }
      | {
          status: "processed";
          eventId: string;
          paymentId: number;
          organizationId: number | null;
          balancePoints: string;
        }
    )
  | { status: "processed" | "ignored"; eventId: string; replayed: false };
export type PaymentError = {
  code: string;
  eventId?: string;
  message?: string;
  requestId?: string;
};
export type PaymentReplayRequest = { provider: string; eventId: string };
export type PaymentReconcileRequest = { limit?: number };
export type PaymentReconcileResponse = {
  caseRisk: { total: number; dueSoonOrOverdue: number; withGap: number };
  reconciled: number;
  staleBefore: string;
  events: { eventId: string; status: number }[];
  failed: number;
};
export type StripeWebhookRequest = {
  id: string;
  type: string;
  data: {
    object: {
      id?: string;
      object?: string;
      status?: string;
      mode?: string;
      payment_status?: string;
      payment_intent?:
        | string
        | { id: string; object: "payment_intent"; [key: string]: unknown }
        | null;
      amount?: number;
      amount_total?: number;
      amount_received?: number;
      amount_capturable?: number;
      amount_captured?: number;
      amount_refunded?: number;
      paid?: boolean;
      captured?: boolean;
      currency?: string;
      metadata?: { [key: string]: unknown } | null;
      client_reference_id?: string | null;
      charge?:
        | string
        | {
            id: string;
            object: "charge";
            payment_intent?:
              | string
              | { id: string; object: "payment_intent"; [key: string]: unknown }
              | null;
            [key: string]: unknown;
          }
        | null;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  amountCents?: number;
  currency?: string;
  userId?: number;
  organizationId?: number;
  checkoutId?: string;
  refundId?: string;
  providerAccount?: string;
  signature?: string;
  occurredAt?: string;
  expiresAt?: string;
  points?: string | number;
  refundedGrantPoints?: string | number;
  grossAmountMinor?: number;
  refundAmountMinor?: number;
  customerRef?: string;
  subscriptionId?: string;
  planSlug?: string;
  status?: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  metadata?: { [key: string]: unknown };
  account?: string;
  created: number;
  [key: string]: unknown;
};
export type ProviderWebhookRequest =
  | {
      eventType: string;
      amountCents?: number;
      currency?: string;
      userId?: number;
      organizationId?: number;
      checkoutId?: string;
      refundId?: string;
      providerAccount?: string;
      signature?: string;
      occurredAt?: string;
      expiresAt?: string;
      providerEventId: string;
      points?: string | number;
      refundedGrantPoints?: string | number;
      grossAmountMinor?: number;
      refundAmountMinor?: number;
      customerRef?: string;
      subscriptionId?: string;
      planSlug?: string;
      status?: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd?: boolean;
      metadata?: { [key: string]: unknown };
    }
  | {
      id: string;
      type: string;
      data: {
        object: {
          id?: string;
          object?: string;
          status?: string;
          mode?: string;
          payment_status?: string;
          payment_intent?:
            | string
            | { id: string; object: "payment_intent"; [key: string]: unknown }
            | null;
          amount?: number;
          amount_total?: number;
          amount_received?: number;
          amount_capturable?: number;
          amount_captured?: number;
          amount_refunded?: number;
          paid?: boolean;
          captured?: boolean;
          currency?: string;
          metadata?: { [key: string]: unknown } | null;
          client_reference_id?: string | null;
          charge?:
            | string
            | {
                id: string;
                object: "charge";
                payment_intent?:
                  | string
                  | {
                      id: string;
                      object: "payment_intent";
                      [key: string]: unknown;
                    }
                  | null;
                [key: string]: unknown;
              }
            | null;
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
      amountCents?: number;
      currency?: string;
      userId?: number;
      organizationId?: number;
      checkoutId?: string;
      refundId?: string;
      providerAccount?: string;
      signature?: string;
      occurredAt?: string;
      expiresAt?: string;
      points?: string | number;
      refundedGrantPoints?: string | number;
      grossAmountMinor?: number;
      refundAmountMinor?: number;
      customerRef?: string;
      subscriptionId?: string;
      planSlug?: string;
      status?: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      cancelAtPeriodEnd?: boolean;
      metadata?: { [key: string]: unknown };
      account?: string;
      created: number;
      [key: string]: unknown;
    };
export type PortaReceiptStatusResponse = {
  attemptId: string;
  dispatchEvidence: "not_dispatched" | "started" | "response" | "unknown";
  receiptId: string | null;
  state: "pending" | "complete" | "not_dispatched";
};
export type PortaError = { porta_error: { code: string; message: string } };
export type SessionPage = {
  limit: number;
  hasMore: boolean;
  totalSteps: number;
  nextCursor: string | null;
};
export type SessionAggregatePoints = string;
export type OverviewDate = string | string;
export type OrganizationScopeQuery = string;
export type OrganizationScope = string | number | null;
export type IdempotencyKey = string;
export type RequestId = string;
export type AttemptId = string;
export type PaymentSubscriptionFacts = {
  subscriptionId: string;
  planSlug: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  metadata?: { [key: string]: unknown };
};
export type RefundRecoverySnapshot = {
  paymentEventId: number;
  refundEventId: number;
  checkoutIntentId: number;
  grantId: number;
  accountId: number;
  userId: number;
  checkoutId: string;
  providerPaymentId: string;
  chargeId: string;
  refundId: string;
  failureBalanceTransactionId: string;
  originalBalanceTransactionId: string;
  organizationId: number | null;
  providerAccount: string | null;
  currency: string;
  livemode: boolean;
  amountMinor: string;
  capturedMinor: string;
  grossRefundMinor: string;
  priorRecoveryMinor: string;
  targetBeforePoints: string;
  targetAfterPoints: string;
  recoveredPoints: string;
  availablePoints: string;
  expiredPoints: string;
  expiredAvailablePoints: string;
  walletDeltaPoints: string;
  originalExpiresAt: string | null;
  walletVersion: number;
  grantVersion: number;
  checkoutRevision: string;
  coveredEvents: { id: number; payloadHash: string }[];
  factSetHash: string;
  providerEvidenceHash: string;
  providerState: "failed" | "canceled";
  failureReason: string;
  disposition: "customer_elected_original_entitlement";
  customerResolutionReference: string;
  evidenceRetrievedAt: string;
  providerRequestId: string | null;
  lossPosition: {
    disputeTargetBeforePoints: string;
    disputeTargetAfterPoints: string;
    refundFundedAfterPoints: string;
    disputeFundedAfterPoints: string;
    refundGapAfterPoints: string;
    disputeGapAfterPoints: string;
    transferredToDisputePoints: string;
    reviewRequired: boolean;
    movements: {
      from: "available" | "refunded" | "disputed" | "expired";
      to: "available" | "refunded" | "disputed" | "expired";
      points: string;
    }[];
  } | null;
};
export type BillingApprovalExecutionRequest = { approvalId: string };
export type BillingApprovalExecutionResponse = {
  approval: {
    approvalId: string;
    action:
      | "reconcile"
      | "wallet_adjust"
      | "refund_recovery"
      | "dispute_review";
    resourceId: string;
    decision: string | null;
    mutationHash: string | null;
    requestedRevision: string;
    reason: string;
    requestedBy: number;
    approvedBy: number | null;
    status: "pending" | "approved" | "consumed" | "rejected" | "expired";
    expiresAt: string;
    approvedAt: string | null;
    consumedAt: string | null;
    deltaPoints: string | null;
    organizationId: number | null;
    recoverySnapshot: {
      paymentEventId: number;
      refundEventId: number;
      checkoutIntentId: number;
      grantId: number;
      accountId: number;
      userId: number;
      checkoutId: string;
      providerPaymentId: string;
      chargeId: string;
      refundId: string;
      failureBalanceTransactionId: string;
      originalBalanceTransactionId: string;
      organizationId: number | null;
      providerAccount: string | null;
      currency: string;
      livemode: boolean;
      amountMinor: string;
      capturedMinor: string;
      grossRefundMinor: string;
      priorRecoveryMinor: string;
      targetBeforePoints: string;
      targetAfterPoints: string;
      recoveredPoints: string;
      availablePoints: string;
      expiredPoints: string;
      expiredAvailablePoints: string;
      walletDeltaPoints: string;
      originalExpiresAt: string | null;
      walletVersion: number;
      grantVersion: number;
      checkoutRevision: string;
      coveredEvents: { id: number; payloadHash: string }[];
      factSetHash: string;
      providerEvidenceHash: string;
      providerState: "failed" | "canceled";
      failureReason: string;
      disposition: "customer_elected_original_entitlement";
      customerResolutionReference: string;
      evidenceRetrievedAt: string;
      providerRequestId: string | null;
      lossPosition: {
        disputeTargetBeforePoints: string;
        disputeTargetAfterPoints: string;
        refundFundedAfterPoints: string;
        disputeFundedAfterPoints: string;
        refundGapAfterPoints: string;
        disputeGapAfterPoints: string;
        transferredToDisputePoints: string;
        reviewRequired: boolean;
        movements: {
          from: "available" | "refunded" | "disputed" | "expired";
          to: "available" | "refunded" | "disputed" | "expired";
          points: string;
        }[];
      } | null;
    } | null;
    disputeReviewSnapshot: {
      sourcePaymentEventId: number;
      coverageHash: string;
      caseCount: number;
      checkoutId: string;
      checkoutIntentId: number;
      grantId: number;
      organizationId: number | null;
      grantVersion: number;
      refundTargetPoints: string;
      disputeTargetPoints: string;
      spendablePoints: string;
      evidenceReference: string;
      expiresAt: string | null;
    } | null;
  };
  duplicate: boolean;
  requestId: string;
};
export type AggregateMinorUnits = string;
export type DisputeReviewSnapshot = {
  sourcePaymentEventId: number;
  coverageHash: string;
  caseCount: number;
  checkoutId: string;
  checkoutIntentId: number;
  grantId: number;
  organizationId: number | null;
  grantVersion: number;
  refundTargetPoints: string;
  disputeTargetPoints: string;
  spendablePoints: string;
  evidenceReference: string;
  expiresAt: string | null;
};
