import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PlatformHttpError } from "./client";

const responseSchema = z.object({
  audience: z.literal("platform-billing"),
  expiresAt: z.string(),
  issuer: z.string(),
  scope: z.array(z.string()),
  subject: z.string(),
  token: z.string().min(1),
});

export type PlatformIdentityExchangeOptions = {
  baseUrl: string;
  displayName?: string;
  serviceToken: string;
  issuer: string;
  subject: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export async function exchangePlatformIdentity(
  options: PlatformIdentityExchangeOptions
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 5000
  );
  try {
    const response = await (options.fetcher ?? fetch)(
      new URL("/api/platform/v1/identity/exchange", options.baseUrl),
      {
        body: JSON.stringify({
          audience: "platform-billing",
          displayName: options.displayName,
          issuer: options.issuer,
          subject: options.subject,
        }),
        headers: {
          Authorization: `Bearer ${options.serviceToken}`,
          "Content-Type": "application/json",
          "X-Request-Id": randomUUID(),
        },
        method: "POST",
        redirect: "error",
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new PlatformHttpError(
        response.status,
        response.status === 403
          ? "PLATFORM_IDENTITY_FORBIDDEN"
          : response.status === 401
            ? "PLATFORM_IDENTITY_UNAUTHORIZED"
            : "PLATFORM_IDENTITY_UNAVAILABLE"
      );
    }
    return responseSchema.parse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export async function deactivatePlatformIdentity(options: {
  baseUrl: string;
  issuer: string;
  serviceToken: string;
  subject: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 5000
  );
  try {
    const response = await (options.fetcher ?? fetch)(
      new URL("/api/platform/v1/internal/identity/deactivate", options.baseUrl),
      {
        body: JSON.stringify({
          issuer: options.issuer,
          subject: options.subject,
        }),
        headers: {
          Authorization: `Bearer ${options.serviceToken}`,
          "Content-Type": "application/json",
          "X-Platform-Internal": "1",
        },
        method: "POST",
        redirect: "error",
        signal: controller.signal,
      }
    );
    const payload = (await response.json()) as {
      code?: string;
      deactivated?: boolean;
      requestId?: string;
    };
    if (!response.ok) {
      throw new Error(
        payload.code ||
          `Platform identity deactivation failed: ${response.status}`
      );
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
