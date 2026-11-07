import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { createCheckoutIdempotencyKey } from "@/app/_lib/idempotency";
import { auth } from "@/app/(auth)/auth";
import {
  PlatformHttpError,
  platformResponseError,
} from "@/server/application/platform/client";
import { CheckoutIntentRequestSchema } from "@/server/application/platform/generated/schemas";
import {
  platformHeaderSchema,
  platformQuerySchema,
} from "@/server/application/platform/generated/wire";
import {
  parsePlatformInput,
  parsePlatformQuery,
  platformRequestHeaders,
  readPlatformJson,
  resolveBrowserOrganizationScope,
} from "@/server/application/platform/request-validation";
import { createUserPlatformClient } from "@/server/application/platform/user-client";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";
import { getEnv, organizationsEnabled } from "@/server/shared/env";
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!sameOriginBrowserControl(request)) {
    return Response.json({ code: "ORIGIN_MISMATCH" }, { status: 403 });
  }
  try {
    parsePlatformQuery(
      platformQuerySchema("billingCreateCheckoutIntent"),
      new URL(request.url).searchParams
    );
    const headers = parsePlatformInput(
      platformHeaderSchema("billingCreateCheckoutIntent"),
      platformRequestHeaders(request, "billingCreateCheckoutIntent")
    );
    const input = parsePlatformInput(
      CheckoutIntentRequestSchema,
      await readPlatformJson(request, "billingCreateCheckoutIntent")
    );
    const organizationId = resolveBrowserOrganizationScope(
      input.organizationId,
      organizationsEnabled(getEnv()),
      (await cookies()).get("chatnest-organization-id")?.value
    );
    const idempotencyKey =
      headers["idempotency-key"] ??
      input.idempotencyKey ??
      (await createCheckoutIdempotencyKey({
        nonce: randomUUID(),
        planSlug: input.planSlug,
        userId: session.user.id,
      }));
    const client = await createUserPlatformClient(session.user);
    if (!client?.createCheckoutIntent) {
      throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
    }
    return Response.json(
      await client.createCheckoutIntent({
        ...input,
        idempotencyKey,
        organizationId,
      }),
      { status: 201 }
    );
  } catch (error) {
    return platformResponseError(error, "CHECKOUT_FAILED");
  }
}
