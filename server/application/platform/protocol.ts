import type { ToolIdentity } from "@/server/domain/billing/types";

export type PlatformReserveInput = {
  attemptId: string;
  billingDimensions?: Record<string, boolean | number | string>;
  operationId: string;
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

export interface PlatformBillingClient {
  dispatch: (input: {
    attemptId: string;
    operationId: string;
  }) => Promise<PlatformDispatchResult>;
  report: (input: PlatformReportInput) => Promise<void>;
  reserve: (input: PlatformReserveInput) => Promise<PlatformReserveResult>;
}
