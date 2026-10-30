import { randomUUID } from "node:crypto";
import { z } from "zod";

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
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      throw new Error(`Platform identity exchange failed: ${response.status}`);
    }
    return responseSchema.parse(payload);
  } finally {
    clearTimeout(timeout);
  }
}
