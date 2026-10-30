import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  PlatformBillingClient,
  PlatformDispatchResult,
  PlatformReportInput,
  PlatformReserveInput,
  PlatformReserveResult,
} from "./protocol";

const reserveResponseSchema = z.object({
  holdId: z.string().min(1),
  priceVersion: z.string().optional(),
  reservedPoints: z.string().regex(/^(?:0|[1-9]\d{0,18})$/),
});

const dispatchResponseSchema = z.object({ permit: z.string().min(1) });

export type PlatformClientOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
  serviceToken: string;
  userToken: string;
  timeoutMs?: number;
};

export class PlatformHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`Platform request failed: ${status} ${code}`);
    this.name = "PlatformHttpError";
  }
}

async function request<T>(
  options: PlatformClientOptions,
  method: string,
  path: string,
  body: unknown,
  idempotencyKey: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const url = new URL(path, options.baseUrl);
    const response = await (options.fetcher ?? fetch)(url, {
      method,
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.serviceToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Platform-User-Token": options.userToken,
        "X-Request-Id": randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const code =
        payload && typeof payload === "object" && "code" in payload
          ? String((payload as { code: unknown }).code)
          : "PLATFORM_REQUEST_FAILED";
      throw new PlatformHttpError(response.status, code);
    }
    return schema.parse(payload);
  } finally {
    clearTimeout(timeout);
  }
}

export function createPlatformBillingClient(
  options: PlatformClientOptions,
): PlatformBillingClient {
  return {
    async reserve(input: PlatformReserveInput): Promise<PlatformReserveResult> {
      return request(
        options,
        "POST",
        "/api/platform/v1/operations/reserve",
        input,
        `${input.operationId}:reserve`,
        reserveResponseSchema,
      );
    },
    async dispatch(input): Promise<PlatformDispatchResult> {
      return request(
        options,
        "POST",
        `/api/platform/v1/operations/${encodeURIComponent(input.operationId)}/dispatch`,
        input,
        `${input.operationId}:dispatch`,
        dispatchResponseSchema,
      );
    },
    async report(input) {
      await request(
        options,
        "POST",
        `/api/platform/v1/operations/${encodeURIComponent(input.operationId)}/report`,
        input,
        `${input.operationId}:report`,
        z.object({ state: z.string().min(1) }),
      );
    },
  };
}
