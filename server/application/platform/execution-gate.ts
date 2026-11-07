import { randomUUID } from "node:crypto";
import {
  type BillingExecutionContext,
  createToolBillingAroundCall,
} from "@/server/application/chat/tool-billing";
import type { BillingRepository } from "@/server/domain/billing/repository";
import type { PlatformBillingClient } from "./protocol";

export type RequestToolBillingInput = {
  chatId: string;
  runId?: string;
  client?: PlatformBillingClient;
  mode: "connected" | "standalone";
  repository?: BillingRepository;
  userId: string;
  organizationId?: string;
};

export function createRequestToolBilling(input: RequestToolBillingInput) {
  let stepIndex = 0;
  const around = createToolBillingAroundCall({
    mode: input.mode,
    operations: input.repository
      ? {
          claimSending: input.repository.claimSending,
          create: async (context: BillingExecutionContext) =>
            input.repository?.createOperation({
              attemptId: context.attemptId,
              canonicalToolKey: context.canonicalToolKey,
              chatId: input.chatId,
              modelId: context.modelId,
              operationId: context.operationId,
              runId: context.runId,
              sessionGroupId: context.sessionGroupId,
              stepIndex: context.stepIndex,
              subjectType: "tool",
              userId: input.userId,
            }),
          enqueueSettlement: input.repository.enqueueSettlement,
          markSettled: input.repository.markSettled,
          saveReceipt: input.repository.saveReceipt,
        }
      : undefined,
    platform: input.client,
  });
  return (call: {
    args: unknown;
    canonicalToolKey: string;
    next: () => Promise<unknown>;
    toolCallId: string;
  }) =>
    around(
      {
        args: call.args,
        attemptId: randomUUID(),
        canonicalToolKey: call.canonicalToolKey,
        operationId: randomUUID(),
        organizationId: input.organizationId,
        runId: input.runId,
        sessionGroupId: input.chatId,
        stepIndex: (() => {
          const current = stepIndex;
          stepIndex += 1;
          return current;
        })(),
        subjectId: input.userId,
        subjectType: "tool",
        toolCallId: call.toolCallId,
      } as BillingExecutionContext & { toolCallId: string },
      call.next
    );
}
