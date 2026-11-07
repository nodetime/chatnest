import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  PlatformHttpError,
  platformResponseError,
} from "@/server/application/platform/client";
import {
  platformPathSchema,
  platformQuerySchema,
} from "@/server/application/platform/generated/wire";
import {
  parsePlatformQuery,
  resolveBrowserOrganizationScope,
} from "@/server/application/platform/request-validation";
import { createUserPlatformClient } from "@/server/application/platform/user-client";
import { getEnv, organizationsEnabled } from "@/server/shared/env";

const querySchema = z.union([
  platformQuerySchema("billingListSessions").omit({ limit: true }),
  platformQuerySchema("billingDetails").extend({
    sessionGroupId: platformPathSchema("billingDetails").shape.sessionGroupId,
  }),
]);
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const query = parsePlatformQuery(
      querySchema,
      new URL(request.url).searchParams
    );
    const organizationId =
      "sessionGroupId" in query
        ? undefined
        : resolveBrowserOrganizationScope(
            query.organizationId,
            organizationsEnabled(getEnv()),
            (await cookies()).get("chatnest-organization-id")?.value
          );
    const client = await createUserPlatformClient(session.user);
    if ("sessionGroupId" in query) {
      if (!client?.sessionDetails) {
        throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
      }
      return Response.json(
        await client.sessionDetails(query.sessionGroupId, {
          cursor: query.cursor,
          limit: query.limit,
        })
      );
    }
    if (!client?.sessionList) {
      throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
    }
    return Response.json(await client.sessionList(organizationId));
  } catch (error) {
    return platformResponseError(error, "BILLING_READ_FAILED");
  }
}
