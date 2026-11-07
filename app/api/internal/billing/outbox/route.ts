import { getUseCases } from "@/server/composition";
import { getEnv } from "@/server/shared/env";

export async function POST(request: Request) {
  const env = getEnv();
  if (
    !env.CHATNEST_CONTROL_TOKEN ||
    request.headers.get("x-chatnest-control-token") !==
      env.CHATNEST_CONTROL_TOKEN
  ) {
    return Response.json({ code: "CONTROL_AUTH_REQUIRED" }, { status: 401 });
  }
  if (
    env.PLATFORM_MODE !== "connected" ||
    !env.PLATFORM_BASE_URL ||
    !env.PLATFORM_SERVICE_TOKEN
  ) {
    return Response.json({ code: "PLATFORM_NOT_CONNECTED" }, { status: 503 });
  }
  const result = await getUseCases().billing.runSettlementWorker();
  return Response.json(result);
}
