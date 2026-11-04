import { getUseCases } from "@/server/composition";
import { getEnv } from "@/server/shared/env";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const token = getEnv().CHATNEST_CONTROL_TOKEN;
  if (!token || request.headers.get("x-chatnest-control-token") !== token) {
    return Response.json(
      { code: "CONTROL_AUTH_REQUIRED" },
      { headers, status: 401 }
    );
  }
  try {
    return Response.json(await getUseCases().admin.purgeAlertHistory(), {
      headers,
    });
  } catch {
    return Response.json(
      { code: "ALERT_HISTORY_RETENTION_FAILED" },
      { headers, status: 503 }
    );
  }
}
