import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  PlatformBillingClient,
  PlatformDispatchResult,
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
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`Platform request failed: ${status} ${code}`);
    this.name = "PlatformHttpError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  options: PlatformClientOptions,
  method: string,
  path: string,
  body: unknown,
  idempotencyKey: string,
  schema: z.ZodType<T>
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 5000
  );
  try {
    const url = new URL(path, options.baseUrl);
    const response = await (options.fetcher ?? fetch)(url, {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${options.serviceToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Platform-User-Token": options.userToken,
        "X-Request-Id": randomUUID(),
      },
      method,
      redirect: "error",
      signal: controller.signal,
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
  options: PlatformClientOptions
): PlatformBillingClient {
  return {
    dispatch(input): Promise<PlatformDispatchResult> {
      return request(
        options,
        "POST",
        `/api/platform/v1/operations/${encodeURIComponent(input.operationId)}/dispatch`,
        input,
        `${input.operationId}:dispatch`,
        dispatchResponseSchema
      );
    },
    async report(input) {
      await request(
        options,
        "POST",
        `/api/platform/v1/operations/${encodeURIComponent(input.operationId)}/report`,
        input,
        `${input.operationId}:report`,
        z.object({ state: z.string().min(1) })
      );
    },
    reserve(input: PlatformReserveInput): Promise<PlatformReserveResult> {
      return request(
        options,
        "POST",
        "/api/platform/v1/operations/reserve",
        input,
        `${input.operationId}:reserve`,
        reserveResponseSchema
      );
    },
  };
}
