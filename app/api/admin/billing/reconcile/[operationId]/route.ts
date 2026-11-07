import { auth } from "@/app/(auth)/auth";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import {
  createPlatformBillingClient,
  platformResponseError,
} from "@/server/application/platform/client";
import { ReconcileRequestSchema } from "@/server/application/platform/generated/schemas";
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

type Context = { params: Promise<{ operationId: string }> };

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
    parsePlatformQuery(
      platformQuerySchema("billingReconcileOperation"),
      new URL(request.url).searchParams
    );
    const { operationId } = parsePlatformInput(
      platformPathSchema("billingReconcileOperation"),
      await context.params
    );
    const headers = platformHeaderSchema("billingReconcileOperation").safeParse(
      platformRequestHeaders(request, "billingReconcileOperation")
    );
    if (!headers.success) {
      const revisionInvalid = headers.error.issues.some(
        (issue) => issue.path[0] === "if-match"
      );
      return Response.json(
        {
          code: revisionInvalid
            ? "REVISION_CONFLICT"
            : "INVALID_PLATFORM_INPUT",
        },
        { status: revisionInvalid ? 412 : 400 }
      );
    }
    const body = parsePlatformInput(
      ReconcileRequestSchema,
      await readPlatformJson(request, "billingReconcileOperation")
    );
    const client = createPlatformBillingClient({
      adminIdentity: {
        issuer: env.PLATFORM_USER_ISSUER ?? "chatnest",
        subject: adminSubject,
      },
      baseUrl: env.PLATFORM_BASE_URL,
      serviceToken: env.PLATFORM_SERVICE_TOKEN,
      timeoutMs: 8000,
    });
    if (!client.reconcileOperation) {
      return Response.json(
        { code: "RECONCILIATION_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    return Response.json(
      await client.reconcileOperation({
        approvalId: body.approvalId,
        decision: body.decision,
        operationId,
        reason: body.reason,
        revision: headers.data["if-match"],
      })
    );
  } catch (error) {
    return platformResponseError(error, "RECONCILIATION_FAILED");
  }
}
