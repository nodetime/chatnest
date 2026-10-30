import { randomUUID } from "node:crypto";
import { wrapLanguageModel } from "ai";
import type { PlatformBillingClient } from "@/server/application/platform/protocol";
import type { BillingRepository } from "@/server/domain/billing/repository";

export type ModelBillingOptions = {
  client: PlatformBillingClient;
  repository: BillingRepository;
  chatId: string;
  runId: string;
  userId: string;
  modelId: string;
  stepIndex: () => number;
};

async function prepare(options: ModelBillingOptions) {
  const operationId = randomUUID();
  const attemptId = randomUUID();
  const stepIndex = options.stepIndex();
  const canonicalToolKey = `model/${options.modelId}`;
  await options.repository.createOperation({
    attemptId,
    canonicalToolKey,
    chatId: options.chatId,
    modelId: options.modelId,
    operationId,
    runId: options.runId,
    sessionGroupId: options.chatId,
    stepIndex,
    subjectType: "model",
    userId: options.userId,
  });
  await options.client.reserve({
    attemptId,
    canonicalToolKey,
    modelId: options.modelId,
    operationId,
    runId: options.runId,
    sessionGroupId: options.chatId,
    stepIndex,
    subjectId: options.userId,
    subjectType: "model",
    tool: { api: options.modelId, platform: "model", provider: "model" },
  });
  await options.client.dispatch({ attemptId, operationId });
  const claimed = await options.repository.claimSending({
    attemptId,
    operationId,
  });
  if (!claimed) {
    throw new Error("Model execution attempt already claimed");
  }
  return { attemptId, operationId };
}

async function report(
  options: ModelBillingOptions,
  operation: { attemptId: string; operationId: string },
  outcome: "response" | "failed" | "unknown"
) {
  const input = { ...operation, outcome };
  try {
    await options.client.report(input);
  } catch (error) {
    await options.repository.enqueueSettlement({
      command: "report",
      idempotencyKey: `${operation.operationId}:report`,
      operationId: operation.operationId,
      payload: input,
    });
    throw error;
  }
}

export function wrapModelWithBilling(
  model: unknown,
  options: ModelBillingOptions
) {
  return wrapLanguageModel({
    middleware: {
      wrapGenerate: async ({ doGenerate }: any): Promise<any> => {
        const operation = await prepare(options);
        try {
          const result = await doGenerate();
          await report(options, operation, "response");
          return result;
        } catch (error) {
          await report(options, operation, "unknown").catch(() => undefined);
          throw error;
        }
      },
      wrapStream: async ({ doStream }: any): Promise<any> => {
        const operation = await prepare(options);
        let reported = false;
        const settle = async (outcome: "response" | "unknown") => {
          if (reported) {
            return;
          }
          reported = true;
          await report(options, operation, outcome);
        };
        try {
          const result = await doStream();
          const stream = result.stream.pipeThrough(
            new TransformStream({
              async flush() {
                await settle("response");
              },
              transform(chunk, controller) {
                controller.enqueue(chunk);
              },
            })
          );
          return { ...result, stream };
        } catch (error) {
          await settle("unknown").catch(() => undefined);
          throw error;
        }
      },
    },
    model: model as never,
  });
}
