import { auth } from "@/app/(auth)/auth";
import { resolvePlatformAdmin } from "@/server/application/admin/access";
import { getUseCases } from "@/server/composition";

export async function GET() {
  const session = await auth();
  if (!(await resolvePlatformAdmin(session?.user))) {
    return Response.json({ code: "ADMIN_REQUIRED" }, { status: 403 });
  }
  const settlement = await getUseCases().billing.settlementHealth?.();
  return Response.json(
    {
      settlement: settlement ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
