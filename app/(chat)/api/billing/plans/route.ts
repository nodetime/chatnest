import { cookies } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import {
  PlatformHttpError,
  platformResponseError,
} from "@/server/application/platform/client";
import { platformQuerySchema } from "@/server/application/platform/generated/wire";
import {
  parsePlatformQuery,
  resolveBrowserOrganizationScope,
} from "@/server/application/platform/request-validation";
import { createUserPlatformClient } from "@/server/application/platform/user-client";
import { getEnv, organizationsEnabled } from "@/server/shared/env";
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const query = parsePlatformQuery(
      platformQuerySchema("billingListPlans"),
      new URL(request.url).searchParams
    );
    const organizationId = resolveBrowserOrganizationScope(
      query.organizationId,
      organizationsEnabled(getEnv()),
      (await cookies()).get("chatnest-organization-id")?.value
    );
    const client = await createUserPlatformClient(session.user);
    if (!client?.plans) {
      throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
    }
    return Response.json(await client.plans(organizationId));
  } catch (error) {
    return platformResponseError(error, "PLANS_READ_FAILED");
  }
}
