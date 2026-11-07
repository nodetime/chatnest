import { auth } from "@/app/(auth)/auth";
import { getUseCases } from "@/server/composition";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";

const MAX_BODY_BYTES = 16_384;

async function regularUser() {
  const session = await auth();
  return session?.user?.type === "regular" ? session.user : null;
}

export async function POST(request: Request) {
  const user = await regularUser();
  if (!user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!sameOriginBrowserControl(request)) {
    return Response.json({ code: "ORIGIN_MISMATCH" }, { status: 403 });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return Response.json({ code: "BODY_TOO_LARGE" }, { status: 413 });
    }
    body = JSON.parse(raw) as unknown;
  } catch {
    return Response.json({ code: "INVALID_JSON" }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    (body as { confirm?: unknown }).confirm !== "DELETE"
  ) {
    return Response.json(
      { code: "DELETE_CONFIRMATION_REQUIRED" },
      { status: 400 }
    );
  }
  try {
    const settings = await getUseCases().account.requestDeletion(
      user.id,
      (body as { reason?: unknown }).reason
    );
    return settings
      ? Response.json(settings, { status: 202 })
      : Response.json({ code: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_DELETION_REASON") {
      return Response.json({ code: error.message }, { status: 400 });
    }
    return Response.json(
      { code: "DELETE_REQUEST_UNAVAILABLE" },
      { status: 503 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await regularUser();
  if (!user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!sameOriginBrowserControl(request)) {
    return Response.json({ code: "ORIGIN_MISMATCH" }, { status: 403 });
  }
  const cancelled = await getUseCases().account.cancelDeletion(user.id);
  return Response.json({ cancelled });
}
