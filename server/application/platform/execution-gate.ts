import { randomUUID } from "node:crypto";
import {
  type BillingExecutionContext,
  createToolBillingAroundCall,
} from "@/server/application/chat/tool-billing";
import type { BillingRepository } from "@/server/domain/billing/repository";
import type { PlatformBillingClient } from "./protocol";

export type RequestToolBillingInput = {
  chatId: string;
  client?: PlatformBillingClient;
  mode: "connected" | "standalone";
  repository?: BillingRepository;
  userId: string;
};

export function createRequestToolBilling(input: RequestToolBillingInput) {
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
              operationId: context.operationId,
              subjectType: "tool",
              userId: input.userId,
            }),
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
        subjectId: input.userId,
        toolCallId: call.toolCallId,
      } as BillingExecutionContext & { toolCallId: string },
      call.next
    );
}
