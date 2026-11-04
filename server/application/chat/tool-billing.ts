import { AsyncLocalStorage } from "node:async_hooks";
import type {
  PlatformBillingClient,
  PlatformReportInput,
  PlatformReserveInput,
} from "@/server/application/platform/protocol";
import type { ToolIdentity } from "@/server/domain/billing/types";

export type BillingExecutionContext = {
  attemptId: string;
  billingDimensions?: Record<string, boolean | number | string>;
  canonicalToolKey: string;
  operationId: string;
  organizationId?: string;
  sessionGroupId?: string;
  runId?: string;
  stepIndex?: number;
  subjectType?: "model" | "tool";
  modelId?: string;
  subjectId: string;
  tool?: ToolIdentity;
};

type OperationStore = {
  claimSending: (input: {
    attemptId: string;
    operationId: string;
  }) => Promise<boolean>;
  create: (input: BillingExecutionContext) => Promise<void>;
  enqueueSettlement?: (input: {
    command: "cancel" | "reconcile" | "report";
    idempotencyKey: string;
    operationId: string;
    payload: unknown;
  }) => Promise<void>;
  markSettled?: (input: { operationId: string }) => Promise<void>;
  saveReceipt?: (input: {
    attemptId: string;
    operationId: string;
    payload: unknown;
    receiptId: string;
  }) => Promise<void>;
};

type ToolBillingOptions = {
  mode: "connected" | "standalone";
  operations?: OperationStore;
  platform?: PlatformBillingClient;
};

export type AroundToolCall = <T>(
  context: BillingExecutionContext,
  next: () => Promise<T>
) => Promise<T>;

const permitStorage = new AsyncLocalStorage<string>();

export function currentExecutionPermit(): string | undefined {
  return permitStorage.getStore();
}

export function withExecutionPermit<T>(
  permit: string,
  next: () => Promise<T>
): Promise<T> {
  return permitStorage.run(permit, next);
}

function assertConnected(
  options: ToolBillingOptions
): asserts options is ToolBillingOptions & {
  operations: OperationStore;
  platform: PlatformBillingClient;
} {
  if (!options.operations || !options.platform) {
    throw new Error("Connected billing requires platform and operation stores");
  }
}

async function reportOrEnqueue(
  operations: OperationStore,
  platform: PlatformBillingClient,
  input: PlatformReportInput
) {
  try {
    await platform.report(input);
    await operations.markSettled?.({ operationId: input.operationId });
  } catch (error) {
    await operations.enqueueSettlement?.({
      command: "report",
      idempotencyKey: `${input.operationId}:report`,
      operationId: input.operationId,
      payload: input,
    });
    throw error;
  }
}

export function createToolBillingAroundCall(
  options: ToolBillingOptions
): AroundToolCall {
  return async <T>(
    context: BillingExecutionContext,
    next: () => Promise<T>
  ): Promise<T> => {
    if (options.mode === "standalone") {
      return next();
    }
    assertConnected(options);
    await options.operations.create(context);
    const reserveInput: PlatformReserveInput = {
      attemptId: context.attemptId,
      billingDimensions: context.billingDimensions,
      canonicalToolKey: context.canonicalToolKey,
      modelId: context.modelId,
      operationId: context.operationId,
      organizationId: context.organizationId,
      runId: context.runId,
      sessionGroupId: context.sessionGroupId ?? context.subjectId,
      stepIndex: context.stepIndex,
      subjectId: context.subjectId,
      subjectType: context.subjectType ?? "tool",
      tool: context.tool ?? {
        api: context.canonicalToolKey,
        platform: "unknown",
        provider: "unknown",
      },
    };
    await options.platform.reserve(reserveInput);
    const permit = await options.platform.dispatch({
      attemptId: context.attemptId,
      operationId: context.operationId,
    });
    const claimed = await options.operations.claimSending({
      attemptId: context.attemptId,
      operationId: context.operationId,
    });
    if (!claimed) {
      throw new Error("Execution attempt already claimed");
    }
    let result: T;
    try {
      result = await withExecutionPermit(permit.permit, next);
    } catch (error) {
      const report: PlatformReportInput = {
        attemptId: context.attemptId,
        operationId: context.operationId,
        outcome: "unknown",
      };
      await reportOrEnqueue(options.operations, options.platform, report);
      throw error;
    }
    const receipt = (
      result && typeof result === "object"
        ? (() => {
            const value = result as {
              executionReceipt?: unknown;
              _meta?: Record<string, unknown>;
            };
            const meta = value._meta;
            const portaMeta =
              meta?.porta && typeof meta.porta === "object"
                ? (meta.porta as Record<string, unknown>)
                : undefined;
            return (
              value.executionReceipt ??
              meta?.["porta/executionReceipt"] ??
              portaMeta?.executionReceipt
            );
          })()
        : undefined
    ) as { receiptId?: string } | undefined;
    if (receipt?.receiptId) {
      await options.operations.saveReceipt?.({
        attemptId: context.attemptId,
        operationId: context.operationId,
        payload: receipt,
        receiptId: receipt.receiptId,
      });
    }
    await reportOrEnqueue(options.operations, options.platform, {
      attemptId: context.attemptId,
      executionReceipt: receipt,
      operationId: context.operationId,
      outcome: "response",
    });
    return result;
  };
}
