import { getEnv } from "@/server/shared/env";
import { createPlatformBillingClient } from "./client";
import { exchangePlatformIdentity } from "./identity";
import type { PlatformBillingClient } from "./protocol";

export async function createUserPlatformClient(user: {
  id: string;
  name?: string | null;
}): Promise<PlatformBillingClient | null> {
  const env = getEnv();
  const baseUrl = env.PLATFORM_BASE_URL;
  const serviceToken = env.PLATFORM_SERVICE_TOKEN;
  if (env.PLATFORM_MODE !== "connected" || !baseUrl || !serviceToken) {
    return null;
  }
  const exchanged = await exchangePlatformIdentity({
    baseUrl,
    displayName: user.name ?? undefined,
    issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
    serviceToken,
    subject: user.id,
  });
  return createPlatformBillingClient({
    baseUrl,
    serviceToken,
    timeoutMs: 8000,
    userToken: exchanged.token,
  });
}
