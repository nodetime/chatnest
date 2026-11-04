import {
  type AlertEventInput,
  alertEventSchema,
} from "@/server/shared/alert-history";

export { alertEventSchema } from "@/server/shared/alert-history";
export function createAlertEventHandler({
  authorized,
  record,
}: {
  authorized: (request: Request) => boolean;
  record: (input: AlertEventInput) => Promise<boolean>;
}) {
  return async (request: Request) => {
    const headers = { "Cache-Control": "private, no-store" };
    if (!authorized(request)) {
      return Response.json(
        { code: "CONTROL_AUTH_REQUIRED" },
        { headers, status: 401 }
      );
    }
    try {
      const reader = request.body?.getReader();
      const decoder = new TextDecoder();
      let text = "";
      let size = 0;
      if (reader) {
        while (true) {
          // biome-ignore lint/performance/noAwaitInLoops: streaming body limit must stop consumption immediately.
          const chunk = await reader.read();
          if (chunk.done) {
            text += decoder.decode();
            break;
          }
          size += chunk.value.byteLength;
          if (size > 4096) {
            await reader.cancel();
            break;
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
      }
      if (size > 4096) {
        return Response.json(
          { code: "ALERT_EVENT_TOO_LARGE" },
          { headers, status: 413 }
        );
      }
      const parsed = alertEventSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return Response.json(
          { code: "INVALID_ALERT_EVENT" },
          { headers, status: 400 }
        );
      }
      return (await record(parsed.data))
        ? Response.json({ recorded: true }, { headers })
        : Response.json(
            { code: "ALERT_EVENT_CONFLICT" },
            { headers, status: 409 }
          );
    } catch (error) {
      return Response.json(
        {
          code:
            error instanceof SyntaxError
              ? "INVALID_JSON"
              : "ALERT_HISTORY_UNAVAILABLE",
        },
        { headers, status: error instanceof SyntaxError ? 400 : 503 }
      );
    }
  };
}
