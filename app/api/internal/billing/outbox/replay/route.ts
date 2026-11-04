import { getUseCases } from "@/server/composition";
import { getEnv } from "@/server/shared/env";
import { getLogger } from "@/server/shared/logger";

const log = getLogger("billing");

export async function POST(request: Request) {
  const env = getEnv();
  if (
    !env.CHATNEST_CONTROL_TOKEN ||
    request.headers.get("x-chatnest-control-token") !==
      env.CHATNEST_CONTROL_TOKEN
  ) {
    return Response.json({ code: "CONTROL_AUTH_REQUIRED" }, { status: 401 });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) {
      return Response.json({ code: "BODY_TOO_LARGE" }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return Response.json({ code: "INVALID_JSON" }, { status: 400 });
  }
  const id =
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "outboxId" in body
      ? (body as { outboxId?: unknown }).outboxId
      : undefined;
  if (typeof id !== "string" || id.length < 1 || id.length > 128) {
    return Response.json({ code: "OUTBOX_ID_REQUIRED" }, { status: 400 });
  }
  const replayed = await getUseCases().billing.replaySettlement(id);
  log.info(
    {
      outboxId: id,
      replayed,
      requestId: request.headers.get("x-request-id") ?? undefined,
    },
    "settlement outbox replay requested"
  );
  return replayed
    ? Response.json({ outboxId: id, replayed: true })
    : Response.json(
        { code: "DEAD_LETTER_NOT_FOUND", outboxId: id },
        { status: 404 }
      );
}
