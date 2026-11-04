import { auth } from "@/app/(auth)/auth";
import { getUseCases } from "@/server/composition";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";

export async function POST(request: Request) {
  const session = await auth();
  if (session?.user?.type !== "regular") {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!sameOriginBrowserControl(request)) {
    return Response.json({ code: "ORIGIN_MISMATCH" }, { status: 403 });
  }
  try {
    const revision = await getUseCases().account.revokeSessions(
      session.user.id
    );
    return revision === null
      ? Response.json({ code: "ACCOUNT_NOT_FOUND" }, { status: 404 })
      : Response.json(
          { revoked: true },
          { headers: { "Cache-Control": "private, no-store" } }
        );
  } catch {
    return Response.json(
      { code: "SESSION_REVOKE_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
