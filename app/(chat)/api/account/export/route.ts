import { auth } from "@/app/(auth)/auth";
import { getUseCases } from "@/server/composition";

const MAX_EXPORT_BYTES = 8 * 1024 * 1024;

export async function GET() {
  const session = await auth();
  if (session?.user?.type !== "regular") {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  const payload = await getUseCases().account.exportData(session.user.id);
  if (!payload) {
    return Response.json({ code: "ACCOUNT_NOT_FOUND" }, { status: 404 });
  }
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > MAX_EXPORT_BYTES) {
    return Response.json({ code: "ACCOUNT_EXPORT_TOO_LARGE" }, { status: 413 });
  }
  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition":
        'attachment; filename="shuzhitan-account-export.json"',
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
