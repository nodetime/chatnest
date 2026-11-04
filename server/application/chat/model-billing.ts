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
  organizationId?: string;
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
    organizationId: options.organizationId,
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
  outcome: "response" | "failed" | "unknown",
  usage?: { inputTokens?: number; outputTokens?: number }
) {
  const input = { ...operation, outcome, ...(usage ? { usage } : {}) };
  try {
    await options.client.report(input);
    await options.repository.markSettled?.({
      operationId: operation.operationId,
    });
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

function normalizeUsage(value: unknown) {
  if (!value || typeof value !== "object") {
    return;
  }
  const usage = value as Record<string, unknown>;
  const tokenCount = (candidate: unknown) => {
    if (typeof candidate === "number") {
      return candidate;
    }
    if (candidate && typeof candidate === "object") {
      return Number((candidate as Record<string, unknown>).total);
    }
    return Number.NaN;
  };
  const inputTokens = tokenCount(usage.inputTokens);
  const outputTokens = tokenCount(usage.outputTokens);
  if (
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    return;
  }
  return { inputTokens, outputTokens };
}

export function wrapModelWithBilling(
  model: unknown,
  options: ModelBillingOptions
) {
  return wrapLanguageModel({
    middleware: {
      wrapGenerate: async ({ doGenerate }: any): Promise<any> => {
        const operation = await prepare(options);
        let providerCompleted = false;
        try {
          const result = await doGenerate();
          providerCompleted = true;
          await report(
            options,
            operation,
            "response",
            normalizeUsage((result as unknown as Record<string, unknown>).usage)
          );
          return result;
        } catch (error) {
          // A report failure already enqueues the canonical response payload.
          // Do not send a second, conflicting unknown report for the same
          // operation; only provider failures have an unknown outcome.
          if (!providerCompleted) {
            await report(options, operation, "unknown").catch(() => undefined);
          }
          throw error;
        }
      },
      wrapStream: async ({ doStream }: any): Promise<any> => {
        const operation = await prepare(options);
        let reported = false;
        let usage: { inputTokens?: number; outputTokens?: number } | undefined;
        const settle = async (outcome: "response" | "unknown") => {
          if (reported) {
            return;
          }
          reported = true;
          await report(options, operation, outcome, usage);
        };
        try {
          const result = await doStream();
          const stream = result.stream.pipeThrough(
            new TransformStream({
              async flush() {
                await settle("response");
              },
              transform(chunk, controller) {
                // AI SDK emits `finish-step` for provider stream usage and
                // `finish` with the aggregate `totalUsage`. Older providers
                // may still put usage directly on `finish`, so accept all
                // three shapes before settling token-priced operations.
                if (chunk?.type === "finish-step") {
                  usage = normalizeUsage(chunk.usage);
                } else if (chunk?.type === "finish") {
                  usage = normalizeUsage(chunk.usage ?? chunk.totalUsage);
                }
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
