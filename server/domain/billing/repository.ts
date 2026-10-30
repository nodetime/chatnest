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
  createOperation: (input: ExecutionOperationInput) => Promise<void>;
  enqueueSettlement: (input: {
    command: "cancel" | "reconcile" | "report";
    idempotencyKey: string;
    operationId: string;
    payload: unknown;
  }) => Promise<void>;
  saveReceipt: (input: ExecutionReceiptInput) => Promise<void>;
}
