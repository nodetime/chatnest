import { and, eq, lte, or, sql } from "drizzle-orm";
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
  async claimSettlement(id, leaseMs = 5 * 60_000) {
    const staleBefore = new Date(Date.now() - leaseMs);
    const rows = await db
      .update(settlementOutbox)
      .set({ state: "processing", updatedAt: new Date() })
      .where(
        and(
          eq(settlementOutbox.id, id),
          or(
            eq(settlementOutbox.state, "pending"),
            eq(settlementOutbox.state, "failed"),
            and(
              eq(settlementOutbox.state, "processing"),
              lte(settlementOutbox.updatedAt, staleBefore)
            )
          )
        )
      )
      .returning({ id: settlementOutbox.id });
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
  async finishSettlement({ id, nextAttemptAt, state }) {
    await db
      .update(settlementOutbox)
      .set({
        attempts: sql`${settlementOutbox.attempts} + 1`,
        nextAttemptAt: nextAttemptAt ?? new Date(),
        state,
        updatedAt: new Date(),
      })
      .where(eq(settlementOutbox.id, id));
  },

  async getSettlementHealth() {
    const rows = await db
      .select({
        count: sql<number>`count(*)::int`,
        oldest: sql<Date | null>`min(${settlementOutbox.createdAt})`,
        state: settlementOutbox.state,
      })
      .from(settlementOutbox)
      .groupBy(settlementOutbox.state);
    const counts = { deadLettered: 0, failed: 0, pending: 0, processing: 0 };
    let oldestPendingAt: string | null = null;
    for (const row of rows) {
      if (row.state === "dead_letter") {
        counts.deadLettered = row.count;
      }
      if (row.state === "failed") {
        counts.failed = row.count;
      }
      if (row.state === "pending") {
        counts.pending = row.count;
      }
      if (row.state === "processing") {
        counts.processing = row.count;
      }
      if (
        row.state === "pending" ||
        row.state === "failed" ||
        row.state === "processing"
      ) {
        const value = row.oldest ? new Date(row.oldest).toISOString() : null;
        if (value && (!oldestPendingAt || value < oldestPendingAt)) {
          oldestPendingAt = value;
        }
      }
    }
    return { ...counts, oldestPendingAt };
  },
  async listPendingSettlement(limit, leaseMs = 5 * 60_000) {
    const rows = await db
      .select({
        attempts: settlementOutbox.attempts,
        command: settlementOutbox.command,
        id: settlementOutbox.id,
        operationId: settlementOutbox.operationId,
        payload: settlementOutbox.payload,
      })
      .from(settlementOutbox)
      .where(
        and(
          or(
            eq(settlementOutbox.state, "pending"),
            eq(settlementOutbox.state, "failed"),
            and(
              eq(settlementOutbox.state, "processing"),
              lte(settlementOutbox.updatedAt, new Date(Date.now() - leaseMs))
            )
          ),
          lte(settlementOutbox.nextAttemptAt, new Date())
        )
      )
      .limit(limit);
    return rows as Array<{
      id: string;
      attempts: number;
      command: "cancel" | "reconcile" | "report";
      operationId: string;
      payload: unknown;
    }>;
  },
  async markSettled({ operationId }) {
    await db
      .update(executionOperation)
      .set({ state: "settled", updatedAt: new Date() })
      .where(eq(executionOperation.operationId, operationId));
  },
  async requeueSettlement(id) {
    const rows = await db
      .update(settlementOutbox)
      .set({
        attempts: 0,
        nextAttemptAt: new Date(),
        state: "pending",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(settlementOutbox.id, id),
          eq(settlementOutbox.state, "dead_letter")
        )
      )
      .returning({ id: settlementOutbox.id });
    return rows.length === 1;
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
