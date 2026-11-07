import { auth } from "@/app/(auth)/auth";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import {
  createPlatformBillingClient,
  platformResponseError,
} from "@/server/application/platform/client";
import { platformQuerySchema } from "@/server/application/platform/generated/wire";
import { parsePlatformQuery } from "@/server/application/platform/request-validation";
import { getEnv } from "@/server/shared/env";

export async function GET(request: Request) {
  const session = await auth();
  if (!(await resolvePlatformAdmin(session?.user))) {
    return Response.json({ code: "ADMIN_REQUIRED" }, { status: 403 });
  }
  const env = getEnv();
  const adminSubject = session?.user?.id;
  if (!adminSubject) {
    return Response.json({ code: "ADMIN_REQUIRED" }, { status: 403 });
  }
  if (
    env.PLATFORM_MODE !== "connected" ||
    !env.PLATFORM_BASE_URL ||
    !env.PLATFORM_SERVICE_TOKEN
  ) {
    return Response.json({ code: "PLATFORM_NOT_CONNECTED" }, { status: 503 });
  }
  try {
    const query = parsePlatformQuery(
      platformQuerySchema("billingListBillingAudit"),
      new URL(request.url).searchParams
    );
    const result = await createPlatformBillingClient({
      adminIdentity: {
        issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
        subject: adminSubject,
      },
      baseUrl: env.PLATFORM_BASE_URL,
      serviceToken: env.PLATFORM_SERVICE_TOKEN,
    }).listBillingAudit?.({
      ...query,
      limit: query.limit === undefined ? undefined : Number(query.limit),
    });
    return result
      ? Response.json(result, {
          headers: { "Cache-Control": "private, no-store" },
        })
      : Response.json({ code: "AUDIT_NOT_CONFIGURED" }, { status: 503 });
  } catch (error) {
    return platformResponseError(error, "AUDIT_LIST_FAILED");
  }
}
