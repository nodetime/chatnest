import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import { getUseCases } from "@/server/composition";
import { sameOriginBrowserControl } from "@/server/shared/browser-policy";

const MAX_BODY_BYTES = 16_384;

async function adminSession() {
  const session = await auth();
  return (await resolvePlatformAdmin(session?.user, process.env, "admin"))
    ? session?.user
    : null;
}

export async function GET() {
  if (!(await adminSession())) {
    return Response.json({ code: "ADMIN_REQUIRED" }, { status: 403 });
  }
  try {
    return Response.json(await getUseCases().account.listDeletionRequests(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { code: "DELETION_QUEUE_UNAVAILABLE" },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const user = await adminSession();
  if (!user) {
    return Response.json({ code: "ADMIN_REQUIRED" }, { status: 403 });
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
  const parsed = z
    .object({
      confirm: z.literal("COMPLETE"),
      requestId: z.uuid(),
    })
    .safeParse(body);
  if (!parsed.success) {
    return Response.json({ code: "INVALID_DELETION_REQUEST" }, { status: 400 });
  }
  try {
    const result = await getUseCases().account.completeDeletionRequest({
      completedBy: user.id,
      requestId: parsed.data.requestId,
    });
    if (result === "not_found") {
      return Response.json(
        { code: "DELETION_REQUEST_NOT_FOUND" },
        { status: 404 }
      );
    }
    if (result === "already_processed") {
      return Response.json(
        { code: "DELETION_REQUEST_ALREADY_PROCESSED" },
        { status: 409 }
      );
    }
    return Response.json({ status: "completed" });
  } catch {
    return Response.json(
      { code: "DELETION_PROCESSING_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
