import { and, eq } from "drizzle-orm";
import type {
  BillingRepository,
  ExecutionOperationInput,
  ExecutionReceiptInput,
} from "@/server/domain/billing/repository";
import { db } from "./client";
import {
  executionOperation,
  executionReceipt,
  settlementOutbox,
} from "./schema";

export const billingRepository: BillingRepository = {
  async claimSending({ attemptId, operationId }) {
    const rows = await db
      .update(executionOperation)
      .set({ state: "sending", updatedAt: new Date() })
      .where(
        and(
          eq(executionOperation.operationId, operationId),
          eq(executionOperation.attemptId, attemptId),
          eq(executionOperation.state, "ready")
        )
      )
      .returning({ operationId: executionOperation.operationId });
    return rows.length === 1;
  },
  async createOperation(input: ExecutionOperationInput) {
    await db.insert(executionOperation).values({
      attemptId: input.attemptId,
      canonicalToolKey: input.canonicalToolKey,
      chatId: input.chatId,
      modelId: input.modelId,
      operationId: input.operationId,
      runId: input.runId,
      sessionGroupId: input.sessionGroupId ?? input.chatId,
      state: "ready",
      stepIndex: input.stepIndex,
      subjectType: input.subjectType,
      userId: input.userId,
    });
  },

  async enqueueSettlement(input) {
    await db.insert(settlementOutbox).values({
      command: input.command,
      idempotencyKey: input.idempotencyKey,
      operationId: input.operationId,
      payload: input.payload,
    });
  },

  async saveReceipt(input: ExecutionReceiptInput) {
    await db.insert(executionReceipt).values({
      attemptId: input.attemptId,
      operationId: input.operationId,
      payload: input.payload,
      receiptId: input.receiptId,
    });
    await db
      .update(executionOperation)
      .set({ receipt: input.payload, state: "sent", updatedAt: new Date() })
      .where(eq(executionOperation.operationId, input.operationId));
  },
};
