import { auth } from "@/app/(auth)/auth";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import {
  createPlatformBillingClient,
  PlatformHttpError,
  platformResponseError,
} from "@/server/application/platform/client";
import { WalletAdjustmentRequestSchema } from "@/server/application/platform/generated/schemas";
import {
  platformHeaderSchema,
  platformPathSchema,
} from "@/server/application/platform/generated/wire";
import {
  parsePlatformInput,
  platformRequestHeaders,
  readPlatformJson,
} from "@/server/application/platform/request-validation";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";
import { getEnv } from "@/server/shared/env";

type Context = { params: Promise<{ userId: string }> };

import { platformQuerySchema } from "@/server/application/platform/generated/wire";
import { parsePlatformQuery } from "@/server/application/platform/request-validation";
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!(await resolvePlatformAdmin(session?.user, process.env, "admin"))) {
    return Response.json({ code: "ADMIN_REQUIRED" }, { status: 403 });
  }
  if (!sameOriginBrowserControl(request)) {
    return Response.json({ code: "ORIGIN_MISMATCH" }, { status: 403 });
  }
  const env = getEnv();
  if (
    env.PLATFORM_MODE !== "connected" ||
    !env.PLATFORM_BASE_URL ||
    !env.PLATFORM_SERVICE_TOKEN
  ) {
    return Response.json({ code: "PLATFORM_NOT_CONNECTED" }, { status: 503 });
  }
  try {
    parsePlatformQuery(
      platformQuerySchema("billingAdminAdjustWallet"),
      new URL(request.url).searchParams
    );
    const { userId } = parsePlatformInput(
      platformPathSchema("billingAdminAdjustWallet"),
      await context.params
    );
    const headers = parsePlatformInput(
      platformHeaderSchema("billingAdminAdjustWallet"),
      platformRequestHeaders(request, "billingAdminAdjustWallet")
    );
    const input = parsePlatformInput(
      WalletAdjustmentRequestSchema,
      await readPlatformJson(request, "billingAdminAdjustWallet")
    );
    const idempotencyKey = headers["idempotency-key"] ?? input.idempotencyKey;
    if (idempotencyKey === undefined) {
      throw new PlatformHttpError(400, "INVALID_IDEMPOTENCY_KEY");
    }
    const result = await createPlatformBillingClient({
      adminIdentity: {
        issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
        subject: session?.user?.id ?? "",
      },
      baseUrl: env.PLATFORM_BASE_URL,
      serviceToken: env.PLATFORM_SERVICE_TOKEN,
    }).adjustWallet?.({
      ...input,
      idempotencyKey,
      userId,
    });
    return result
      ? Response.json(result)
      : Response.json(
          { code: "WALLET_ADJUST_NOT_CONFIGURED" },
          { status: 503 }
        );
  } catch (error) {
    return platformResponseError(error, "WALLET_ADJUST_FAILED");
  }
}
