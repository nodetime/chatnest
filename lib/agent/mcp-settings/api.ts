import "server-only";
import { ZodError } from "zod";
import type { ServerConfig } from "../config";
import { actionSchema, MAX_BODY_BYTES } from "./schema";
import {
  authorizeManagement,
  type Environment,
  SettingsError,
} from "./security";
import type { createSettingsService } from "./service";

async function readBody(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new SettingsError(413, "配置内容过大。");
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new SettingsError(400, "请求内容为空。");
  }
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      // biome-ignore lint/performance/noAwaitInLoops: Consume the stream sequentially to enforce the byte limit before buffering.
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.length;
      if (size > MAX_BODY_BYTES) {
        throw new SettingsError(413, "配置内容过大。");
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createManagementHandler({
  session,
  file,
  service,
  env = process.env,
}: {
  session: () => Promise<{ id?: string; type?: string } | null | undefined>;
  file: () => Promise<ServerConfig[]>;
  service: Pick<
    ReturnType<typeof createSettingsService>,
    "get" | "test" | "mutate"
  >;
  env?: Environment;
}) {
  return async (request: Request) => {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const userId = authorizeManagement(
        await session(),
        request,
        request.method !== "GET",
        env
      );
      if (request.method === "GET") {
        return Response.json(await service.get(await file()), { headers });
      }
      const action = actionSchema.parse(await readBody(request));
      const data =
        action.action === "test"
          ? await service.test(action)
          : await service.mutate(action, userId, await file());
      return Response.json(data, { headers });
    } catch (error) {
      const status =
        error instanceof SettingsError
          ? error.status
          : error instanceof ZodError || error instanceof SyntaxError
            ? 400
            : 500;
      return Response.json(
        {
          error:
            error instanceof SettingsError
              ? error.message
              : status === 400
                ? "配置格式无效，请检查输入。"
                : "MCP 设置操作失败，请检查部署配置或服务状态。",
        },
        { headers, status }
      );
    }
  };
}
