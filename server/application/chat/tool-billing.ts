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
  subjectId: string;
  tool?: ToolIdentity;
};

type OperationStore = {
  claimSending: (input: {
    attemptId: string;
    operationId: string;
  }) => Promise<boolean>;
  create: (input: BillingExecutionContext) => Promise<void>;
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
      operationId: context.operationId,
      subjectId: context.subjectId,
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
      await options.platform.report(report);
      throw error;
    }
    await options.platform.report({
      attemptId: context.attemptId,
      operationId: context.operationId,
      outcome: "response",
      receipt:
        result && typeof result === "object"
          ? (result as { executionReceipt?: unknown }).executionReceipt
          : undefined,
    });
    return result;
  };
}
