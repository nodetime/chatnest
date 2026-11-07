import { cookies } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import {
  PlatformHttpError,
  platformResponseError,
} from "@/server/application/platform/client";
import { CreateOrganizationRequestSchema } from "@/server/application/platform/generated/schemas";
import { platformQuerySchema } from "@/server/application/platform/generated/wire";
import {
  parsePlatformInput,
  parsePlatformQuery,
  readPlatformJson,
} from "@/server/application/platform/request-validation";
import { createUserPlatformClient } from "@/server/application/platform/user-client";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";
import { getEnv, organizationsEnabled } from "@/server/shared/env";
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!organizationsEnabled(getEnv())) {
    return Response.json({ code: "FEATURE_DISABLED" }, { status: 403 });
  }
  try {
    parsePlatformQuery(
      platformQuerySchema("billingListOrganizations"),
      new URL(request.url).searchParams
    );
    const client = await createUserPlatformClient(session.user);
    if (!client?.organizations) {
      throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
    }
    const result = await client.organizations();
    return Response.json({
      ...result,
      selectedOrganizationId:
        (await cookies()).get("chatnest-organization-id")?.value ?? null,
    });
  } catch (error) {
    return platformResponseError(error, "ORGANIZATIONS_READ_FAILED");
  }
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!sameOriginBrowserControl(request)) {
    return Response.json({ code: "ORIGIN_MISMATCH" }, { status: 403 });
  }
  if (!organizationsEnabled(getEnv())) {
    return Response.json({ code: "FEATURE_DISABLED" }, { status: 403 });
  }
  try {
    parsePlatformQuery(
      platformQuerySchema("billingCreateOrganization"),
      new URL(request.url).searchParams
    );
    const input = parsePlatformInput(
      CreateOrganizationRequestSchema,
      await readPlatformJson(request, "billingCreateOrganization")
    );
    const client = await createUserPlatformClient(session.user);
    if (!client?.createOrganization) {
      throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
    }
    return Response.json(await client.createOrganization(input), {
      status: 201,
    });
  } catch (error) {
    return platformResponseError(error, "ORGANIZATION_CREATE_FAILED");
  }
}
