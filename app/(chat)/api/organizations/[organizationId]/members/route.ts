import { auth } from "@/app/(auth)/auth";
import {
  PlatformHttpError,
  platformResponseError,
} from "@/server/application/platform/client";
import { AddOrganizationMemberRequestSchema } from "@/server/application/platform/generated/schemas";
import {
  platformPathSchema,
  platformQuerySchema,
} from "@/server/application/platform/generated/wire";
import {
  parsePlatformInput,
  parsePlatformQuery,
  readPlatformJson,
} from "@/server/application/platform/request-validation";
import { createUserPlatformClient } from "@/server/application/platform/user-client";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";
import { getEnv, organizationsEnabled } from "@/server/shared/env";

type Context = { params: Promise<{ organizationId: string }> };
export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!organizationsEnabled(getEnv())) {
    return Response.json({ code: "FEATURE_DISABLED" }, { status: 403 });
  }
  try {
    parsePlatformQuery(
      platformQuerySchema("billingListOrganizationMembers"),
      new URL(request.url).searchParams
    );
    const { organizationId } = parsePlatformInput(
      platformPathSchema("billingListOrganizationMembers"),
      await context.params
    );
    const client = await createUserPlatformClient(session.user);
    if (!client?.listOrganizationMembers) {
      throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
    }
    return Response.json(await client.listOrganizationMembers(organizationId));
  } catch (error) {
    return platformResponseError(error, "MEMBERS_READ_FAILED");
  }
}
export async function POST(request: Request, context: Context) {
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
      platformQuerySchema("billingAddOrganizationMember"),
      new URL(request.url).searchParams
    );
    const { organizationId } = parsePlatformInput(
      platformPathSchema("billingAddOrganizationMember"),
      await context.params
    );
    const input = parsePlatformInput(
      AddOrganizationMemberRequestSchema,
      await readPlatformJson(request, "billingAddOrganizationMember")
    );
    const client = await createUserPlatformClient(session.user);
    if (!client?.addOrganizationMember) {
      throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
    }
    return Response.json(
      await client.addOrganizationMember({ ...input, organizationId }),
      { status: 201 }
    );
  } catch (error) {
    return platformResponseError(error, "MEMBER_ADD_FAILED");
  }
}
