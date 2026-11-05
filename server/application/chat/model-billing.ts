import { randomUUID } from "node:crypto";
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { APICallError, wrapLanguageModel } from "ai";
import {
  reportOrEnqueue,
  reserveAndDispatch,
} from "@/server/application/platform/attempt-settlement";
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
  await reserveAndDispatch(options.repository, options.client, {
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
  return { attemptId, operationId };
}

function report(
  options: ModelBillingOptions,
  operation: { attemptId: string; operationId: string },
  outcome: "response" | "failed" | "unknown",
  usage?: { inputTokens?: number; outputTokens?: number }
) {
  return reportOrEnqueue(options.repository, options.client, {
    ...operation,
    outcome,
    ...(usage ? { usage } : {}),
  });
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

function modelRateLimit(error: unknown) {
  if (!APICallError.isInstance(error) || error.statusCode !== 429) {
    return;
  }
  // The provider rejected this request. Do not let the SDK open another hold
  // for the same step, or treat this known rejection as an ambiguous send.
  return new APICallError({
    isRetryable: false,
    message: "模型服务暂时拒绝请求（429），请稍后重试。",
    requestBodyValues: undefined,
    statusCode: 429,
    url: error.url,
  });
}

export function wrapModelWithBilling(
  model: unknown,
  options: ModelBillingOptions
) {
  return wrapLanguageModel({
    middleware: {
      wrapGenerate: async ({ doGenerate }) => {
        const operation = await prepare(options);
        let providerCompleted = false;
        try {
          const result = await doGenerate();
          providerCompleted = true;
          await report(
            options,
            operation,
            "response",
            normalizeUsage(result.usage)
          );
          return result;
        } catch (error) {
          // A report failure already enqueues the canonical response payload.
          // Do not send a second, conflicting unknown report for the same
          // operation; only provider failures have an unknown outcome.
          if (!providerCompleted) {
            const limited = modelRateLimit(error);
            await report(
              options,
              operation,
              limited ? "failed" : "unknown"
            ).catch(() => undefined);
            throw limited ?? error;
          }
          throw error;
        }
      },
      wrapStream: async ({ doStream }) => {
        const operation = await prepare(options);
        let result: Awaited<ReturnType<typeof doStream>>;
        try {
          result = await doStream();
        } catch (error) {
          const limited = modelRateLimit(error);
          await report(
            options,
            operation,
            limited ? "failed" : "unknown"
          ).catch(() => undefined);
          throw limited ?? error;
        }

        const reader = result.stream.getReader();
        let reported = false;
        let completed = false;
        let failed = false;
        let usage: ReturnType<typeof normalizeUsage>;
        const settle = (outcome: "response" | "unknown") => {
          if (reported) {
            return;
          }
          reported = true;
          return report(
            options,
            operation,
            outcome,
            outcome === "response" ? usage : undefined
          );
        };
        const stream = new ReadableStream<LanguageModelV4StreamPart>(
          {
            async cancel(reason) {
              // Cancel can race a pending read. Record the outcome first; the
              // terminal guard also covers the resulting read rejection.
              const settlement = settle("unknown");
              await Promise.allSettled([reader.cancel(reason), settlement]);
            },
            async pull(controller) {
              let part: ReadableStreamReadResult<LanguageModelV4StreamPart>;
              try {
                part = await reader.read();
              } catch (error) {
                await settle("unknown")?.catch(() => undefined);
                controller.error(error);
                return;
              }
              if (reported) {
                return; // A downstream cancellation won the race.
              }
              if (part.done) {
                await settle(completed && !failed ? "response" : "unknown");
                controller.close();
                return;
              }
              if (part.value.type === "error") {
                failed = true;
              } else if (part.value.type === "finish") {
                const { unified, raw } = part.value.finishReason;
                // OpenAI also emits a synthetic finish at bare SSE EOF. Its
                // default "other" without a raw reason is not completion.
                completed =
                  unified !== "error" &&
                  (unified !== "other" || raw !== undefined);
                failed ||= !completed;
                usage = normalizeUsage(part.value.usage);
              }
              controller.enqueue(part.value);
            },
          },
          { highWaterMark: 0 }
        );
        return { ...result, stream };
      },
    },
    model: model as never,
  });
}
