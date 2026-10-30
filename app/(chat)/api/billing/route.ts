import { auth } from "@/app/(auth)/auth";
import { createPlatformBillingClient } from "@/server/application/platform/client";
import { getEnv } from "@/server/shared/env";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const sessionGroupId = searchParams.get("sessionGroupId") || "";
  if (!sessionGroupId) {
    return Response.json({ code: "SESSION_GROUP_REQUIRED" }, { status: 400 });
  }
  const env = getEnv();
  if (
    env.PLATFORM_MODE !== "connected" ||
    !env.PLATFORM_BASE_URL ||
    !env.PLATFORM_SERVICE_TOKEN ||
    !env.PLATFORM_USER_TOKEN
  ) {
    return Response.json({ code: "PLATFORM_NOT_CONNECTED" }, { status: 503 });
  }
  const client = createPlatformBillingClient({
    baseUrl: env.PLATFORM_BASE_URL,
    serviceToken: env.PLATFORM_SERVICE_TOKEN,
    userToken: env.PLATFORM_USER_TOKEN,
  });
  const details = await client.sessionDetails?.(sessionGroupId);
  return Response.json(details);
}
