import "server-only";
import { ZodError } from "zod";
import {
  authorizeManagement,
  SettingsError,
} from "@/server/agent/mcp-settings/security";
import { readBoundedBody, UploadError } from "@/server/uploads/validation";
import { createModelSettingsService } from "./service";
export function createModelSettingsHandler({
  session,
  service = createModelSettingsService(),
}: {
  session: () => Promise<{ id?: string; type?: string } | null | undefined>;
  service?: ReturnType<typeof createModelSettingsService>;
}) {
  return async (request: Request) => {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const userId = authorizeManagement(
        await session(),
        request,
        request.method !== "GET"
      );
      if (request.method === "GET") {
        return Response.json(await service.get(), { headers });
      }
      if (request.method !== "POST") {
        return Response.json(
          { error: "不支持此操作。" },
          { headers, status: 405 }
        );
      }
      let body: unknown;
      try {
        body = JSON.parse(
          (await readBoundedBody(request, 32_768)).toString("utf8")
        );
      } catch (error) {
        if (error instanceof UploadError) {
          throw error;
        }
        // biome-ignore lint/style/useErrorCause: JSON causes may contain credentials.
        throw new SettingsError(400, "请求格式错误。");
      }
      if (!body || typeof body !== "object" || !("action" in body)) {
        throw new SettingsError(400, "操作格式错误。");
      }
      const { action, ...edit } = body;
      const result =
        action === "save"
          ? await service.save(edit, userId)
          : action === "test"
            ? await service.test(edit)
            : action === "models"
              ? await service.models(edit)
              : null;
      if (!result) {
        throw new SettingsError(400, "不支持此操作。");
      }
      return Response.json(result, { headers });
    } catch (error) {
      const status =
        error instanceof SettingsError || error instanceof UploadError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 503;
      return Response.json(
        {
          error:
            error instanceof SettingsError
              ? error.message
              : status === 400
                ? "请检查地址、模型列表和 Key 格式。"
                : status === 413
                  ? "配置内容过大。"
                  : "模型配置操作失败，请检查地址或平台存储配置。",
        },
        { headers, status }
      );
    }
  };
}
