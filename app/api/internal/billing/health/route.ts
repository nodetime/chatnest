import { getUseCases } from "@/server/composition";
import { getEnv } from "@/server/shared/env";

export async function GET(request: Request) {
  const env = getEnv();
  if (
    !env.CHATNEST_CONTROL_TOKEN ||
    request.headers.get("x-chatnest-control-token") !==
      env.CHATNEST_CONTROL_TOKEN
  ) {
    return Response.json({ code: "CONTROL_AUTH_REQUIRED" }, { status: 401 });
  }
  const settlement = await getUseCases().billing.settlementHealth?.();
  return Response.json({
    checkedAt: new Date().toISOString(),
    mode: env.PLATFORM_MODE ?? "standalone",
    platformConfigured: Boolean(
      env.PLATFORM_MODE === "connected" &&
        env.PLATFORM_BASE_URL &&
        env.PLATFORM_SERVICE_TOKEN
    ),
    settlement,
    settlementBatchSize: env.CHATNEST_SETTLEMENT_BATCH_SIZE ?? 25,
  });
}
