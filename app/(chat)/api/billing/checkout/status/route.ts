import { auth } from "@/app/(auth)/auth";
import {
  PlatformHttpError,
  platformResponseError,
} from "@/server/application/platform/client";
import { platformPathSchema } from "@/server/application/platform/generated/wire";
import { parsePlatformQuery } from "@/server/application/platform/request-validation";
import { createUserPlatformClient } from "@/server/application/platform/user-client";
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    // Browser query is the existing checkout path selector, with the same generated value constraint.
    const { checkoutId } = parsePlatformQuery(
      platformPathSchema("billingCheckoutStatus"),
      new URL(request.url).searchParams
    );
    const client = await createUserPlatformClient(session.user);
    if (!client?.checkoutStatus) {
      throw new PlatformHttpError(503, "PLATFORM_NOT_CONNECTED");
    }
    return Response.json(await client.checkoutStatus(checkoutId));
  } catch (error) {
    return platformResponseError(error, "CHECKOUT_STATUS_READ_FAILED");
  }
}
