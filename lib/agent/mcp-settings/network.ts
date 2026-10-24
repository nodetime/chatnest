import "server-only";
import { connectionSchema } from "./schema";
import type { Environment } from "./security";
import type { Connection } from "./types";
export const MAX_RESPONSE_BYTES = 1_048_576;
export const DISCOVERY_TIMEOUT_MS = 10_000;
export function allowedOrigins(env: Environment = process.env) {
  const values = env.MCP_ALLOWED_ORIGINS?.split(",").map((v) => v.trim());
  if (
    !values?.length ||
    values.some((value) => {
      try {
        const url = new URL(value);
        return (
          value.includes("*") ||
          url.origin !== value ||
          url.username ||
          url.password ||
          !(url.protocol === "https:" || loopback(url, env))
        );
      } catch {
        return true;
      }
    })
  ) {
    throw new Error("MCP trusted origins are not configured correctly");
  }
  return new Set(values);
}
function loopback(url: URL, env: Environment) {
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    ["development", "test"].includes(env.NODE_ENV ?? "") &&
    env.AGENT_MCP_ALLOW_LOOPBACK_HTTP === "1"
  );
}
export function validateConnection(
  connection: Connection,
  env: Environment = process.env
) {
  connectionSchema.parse(connection);
  const url = new URL(connection.url);
  if (
    url.username ||
    url.password ||
    url.hash ||
    !(url.protocol === "https:" || loopback(url, env)) ||
    !allowedOrigins(env).has(url.origin)
  ) {
    throw new Error("MCP endpoint is not an approved destination");
  }
  return url;
}
export function guardedFetch(
  connection: Connection,
  env: Environment,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch
): typeof fetch {
  const endpoint = validateConnection(connection, env);
  return async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString()
    );
    if (
      url.origin !== endpoint.origin ||
      url.pathname !== endpoint.pathname ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error("MCP request destination was rejected");
    }
    // MCP requests are JSON, not uploads. Buffer at most 1 MiB before any egress.
    const request = new Request(input, init);
    let requestBody: Uint8Array<ArrayBuffer> | undefined;
    if (request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          // biome-ignore lint/performance/noAwaitInLoops: Sequential bounded stream consumption prevents unbounded uploads.
          const result = await reader.read();
          if (result.done) {
            break;
          }
          size += result.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            throw new Error("MCP request is too large");
          }
          chunks.push(result.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      requestBody = new Uint8Array(Buffer.concat(chunks));
    }
    const response = await fetcher(request.url, {
      ...init,
      body: requestBody,
      headers: request.headers,
      method: request.method,
      redirect: "error",
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
        request.signal,
        ...(init?.signal ? [init.signal] : []),
      ]),
    });
    if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new Error("MCP response is too large");
    }
    if (!response.body) {
      return response;
    }
    const reader = response.body.getReader();
    let size = 0;
    const body = new ReadableStream<Uint8Array>({
      async cancel() {
        await reader.cancel();
      },
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            controller.close();
            return;
          }
          size += result.value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            controller.error(new Error("MCP response is too large"));
            return;
          }
          controller.enqueue(result.value);
        } catch {
          controller.error(new Error("MCP response could not be read"));
        }
      },
    });
    return new Response(body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };
}
