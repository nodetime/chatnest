import type { ToolIdentity } from "@/server/domain/billing/types";

export type PlatformReserveInput = {
  attemptId: string;
  billingDimensions?: Record<string, boolean | number | string>;
  canonicalToolKey?: string;
  operationId: string;
  sessionGroupId?: string;
  runId?: string;
  stepIndex?: number;
  subjectType?: "model" | "tool";
  modelId?: string;
  subjectId: string;
  tool: ToolIdentity;
};

export type PlatformReserveResult = {
  holdId: string;
  priceVersion?: string;
  reservedPoints: string;
};

export type PlatformDispatchResult = {
  permit: string;
};

export type PlatformReportInput = {
  attemptId: string;
  operationId: string;
  outcome: "response" | "failed" | "unknown";
  receipt?: unknown;
};

export type PlatformSessionDetails = {
  session: {
    sessionGroupId: string;
    chatId: string;
    runId: string | null;
    status: string;
  };
  totals: { reservedPoints: string; capturedPoints: string };
  steps: Array<{
    operationId: string;
    attemptId: string;
    subjectType: "model" | "tool";
    canonicalToolKey: string;
    modelId: string | null;
    stepIndex: number | null;
    state: string;
    reservedPoints: string;
    capturedPoints: string;
    outcome: string | null;
    receipt: unknown;
    createdAt: string;
    updatedAt: string;
  }>;
};

export interface PlatformBillingClient {
  dispatch: (input: {
    attemptId: string;
    operationId: string;
  }) => Promise<PlatformDispatchResult>;
  report: (input: PlatformReportInput) => Promise<void>;
  reserve: (input: PlatformReserveInput) => Promise<PlatformReserveResult>;
  sessionDetails?: (sessionGroupId: string) => Promise<PlatformSessionDetails>;
}
