export type ExecutionOperationInput = {
  attemptId: string;
  canonicalToolKey: string;
  chatId: string;
  operationId: string;
  sessionGroupId?: string;
  stepIndex?: number;
  modelId?: string;
  runId?: string;
  subjectType: "model" | "tool";
  userId: string;
};

export type ExecutionReceiptInput = {
  attemptId: string;
  operationId: string;
  payload: unknown;
  receiptId: string;
};

export interface BillingRepository {
  claimSending: (input: {
    attemptId: string;
    operationId: string;
  }) => Promise<boolean>;
  claimSettlement?: (id: string, leaseMs?: number) => Promise<boolean>;
  createOperation: (input: ExecutionOperationInput) => Promise<void>;
  enqueueSettlement: (input: {
    command: "cancel" | "reconcile" | "report";
    idempotencyKey: string;
    operationId: string;
    payload: unknown;
  }) => Promise<void>;
  finishSettlement?: (input: {
    id: string;
    state: "succeeded" | "failed" | "dead_letter";
    nextAttemptAt?: Date;
  }) => Promise<void>;
  getSettlementHealth?: () => Promise<{
    deadLettered: number;
    failed: number;
    pending: number;
    processing: number;
    oldestPendingAt: string | null;
  }>;
  listPendingSettlement?: (
    limit: number,
    leaseMs?: number
  ) => Promise<
    Array<{
      attempts: number;
      id: string;
      command: "cancel" | "reconcile" | "report";
      operationId: string;
      payload: unknown;
    }>
  >;
  /** Mark the local execution terminal after the platform accepted settlement. */
  markSettled?: (input: { operationId: string }) => Promise<void>;
  /** Reset a dead-letter command for an explicit operator replay. */
  requeueSettlement?: (id: string) => Promise<boolean>;
  saveReceipt: (input: ExecutionReceiptInput) => Promise<void>;
}
