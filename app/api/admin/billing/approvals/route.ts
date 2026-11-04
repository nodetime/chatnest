import { auth } from "@/app/(auth)/auth";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import {
  createPlatformBillingClient,
  platformResponseError,
} from "@/server/application/platform/client";
import { ApprovalRequestSchema } from "@/server/application/platform/generated/schemas";
import { platformQuerySchema } from "@/server/application/platform/generated/wire";
import {
  parsePlatformInput,
  parsePlatformQuery,
  readPlatformJson,
} from "@/server/application/platform/request-validation";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";
import { getEnv } from "@/server/shared/env";

export async function GET(request: Request) {
  const session = await auth();
  if (!(await resolvePlatformAdmin(session?.user, process.env))) {
    return Response.json({ code: "ADMIN_REQUIRED" }, { status: 403 });
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
    const query = parsePlatformQuery(
      platformQuerySchema("billingListBillingApprovals"),
      new URL(request.url).searchParams
    );
    const result = await createPlatformBillingClient({
      adminIdentity: {
        issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
        subject: session?.user?.id ?? "",
      },
      baseUrl: env.PLATFORM_BASE_URL,
      serviceToken: env.PLATFORM_SERVICE_TOKEN,
    }).listBillingApprovals?.(
      query.status,
      query.cursor,
      query.limit === undefined ? undefined : Number(query.limit)
    );
    return result
      ? Response.json(result, {
          headers: { "Cache-Control": "private, no-store" },
        })
      : Response.json({ code: "APPROVAL_NOT_CONFIGURED" }, { status: 503 });
  } catch (error) {
    return platformResponseError(error, "APPROVAL_LIST_FAILED");
  }
}

export async function POST(request: Request) {
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
      platformQuerySchema("billingRequestBillingApproval"),
      new URL(request.url).searchParams
    );
    const input = parsePlatformInput(
      ApprovalRequestSchema,
      await readPlatformJson(request, "billingRequestBillingApproval")
    );
    const approval = await createPlatformBillingClient({
      adminIdentity: {
        issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
        subject: session?.user?.id ?? "",
      },
      baseUrl: env.PLATFORM_BASE_URL,
      serviceToken: env.PLATFORM_SERVICE_TOKEN,
    }).requestBillingApproval?.(input);
    return approval
      ? Response.json({ approval })
      : Response.json({ code: "APPROVAL_NOT_CONFIGURED" }, { status: 503 });
  } catch (error) {
    return platformResponseError(error, "APPROVAL_REQUEST_FAILED");
  }
}
