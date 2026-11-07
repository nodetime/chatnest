import { cookies } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import {
  PlatformHttpError,
  platformResponseError,
} from "@/server/application/platform/client";
import { CheckoutIntentRequestSchema } from "@/server/application/platform/generated/schemas";
import { platformQuerySchema } from "@/server/application/platform/generated/wire";
import {
  parsePlatformInput,
  parsePlatformQuery,
  readJsonInput,
  resolveBrowserOrganizationScope,
} from "@/server/application/platform/request-validation";
import { createUserPlatformClient } from "@/server/application/platform/user-client";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";
import { getEnv, organizationsEnabled } from "@/server/shared/env";

const selectionSchema = CheckoutIntentRequestSchema.pick({
  organizationId: true,
}).required();
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
      platformQuerySchema("billingListOrganizations"),
      new URL(request.url).searchParams
    );
    const input = parsePlatformInput(
      selectionSchema,
      await readJsonInput(request, 64 * 1024)
    );
    const enabled = organizationsEnabled(getEnv());
    const organizationId = resolveBrowserOrganizationScope(
      input.organizationId,
      enabled,
      undefined
    );
    const cookieStore = await cookies();
    if (!enabled) {
      cookieStore.delete("chatnest-organization-id");
      return Response.json({ featureEnabled: false, organizationId: null });
    }
    if (organizationId === undefined) {
      cookieStore.delete("chatnest-organization-id");
    } else {
      const client = await createUserPlatformClient(session.user);
      if (!client?.organizations) {
        throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
      }
      const result = await client.organizations();
      if (
        !result.organizations.some((item) => String(item.id) === organizationId)
      ) {
        throw new PlatformHttpError(403, "ORGANIZATION_FORBIDDEN");
      }
      cookieStore.set("chatnest-organization-id", organizationId, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }
    return Response.json({ organizationId: organizationId ?? null });
  } catch (error) {
    return platformResponseError(error, "ORGANIZATION_SELECT_FAILED");
  }
}
