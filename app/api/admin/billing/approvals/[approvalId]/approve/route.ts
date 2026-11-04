import { auth } from "@/app/(auth)/auth";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import {
  createPlatformBillingClient,
  platformResponseError,
} from "@/server/application/platform/client";
import { platformPathSchema } from "@/server/application/platform/generated/wire";
import { parsePlatformInput } from "@/server/application/platform/request-validation";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";
import { getEnv } from "@/server/shared/env";

type Context = { params: Promise<{ approvalId: string }> };

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
      platformQuerySchema("billingApproveBillingApproval"),
      new URL(request.url).searchParams
    );
    const { approvalId } = parsePlatformInput(
      platformPathSchema("billingApproveBillingApproval"),
      await context.params
    );
    const approval = await createPlatformBillingClient({
      adminIdentity: {
        issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
        subject: session?.user?.id ?? "",
      },
      baseUrl: env.PLATFORM_BASE_URL,
      serviceToken: env.PLATFORM_SERVICE_TOKEN,
    }).approveBillingApproval?.(approvalId);
    return approval
      ? Response.json({ approval })
      : Response.json({ code: "APPROVAL_NOT_CONFIGURED" }, { status: 503 });
  } catch (error) {
    return platformResponseError(error, "APPROVAL_APPROVE_FAILED");
  }
}
