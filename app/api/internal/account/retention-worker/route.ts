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
  try {
    return Response.json(await getUseCases().account.runRetentionWorker());
  } catch {
    return Response.json(
      { code: "ACCOUNT_RETENTION_WORKER_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
