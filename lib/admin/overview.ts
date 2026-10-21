import "server-only";
import { resolveServerConnection, type ServerConfig } from "@/lib/agent/config";
import {
  authorizeManagement,
  type Environment,
  SettingsError,
} from "@/lib/agent/mcp-settings/security";
import type { SettingsProjection } from "@/lib/agent/mcp-settings/types";
import type {
  AdminOverviewData,
  ModelReadiness,
  Readiness,
  StorageReadiness,
  ToolsReadiness,
} from "./overview-types";

export function summarizeTools(
  file: ServerConfig[],
  settings: SettingsProjection,
  env: Environment = process.env
): ToolsReadiness {
  const enabled = settings.servers.filter((server) => server.enabled);
  const configuredFiles = file.filter((server) => {
    const connection = resolveServerConnection(server, env);
    return !connection.invalid && connection.missing.length === 0;
  });
  return {
    configured:
      configuredFiles.length +
      settings.servers.filter((server) => server.source === "managed").length,
    enabled: enabled.length,
    managementConfigured: settings.configured,
    openTools: enabled.reduce(
      (count, server) => count + server.allowedTools.length,
      0
    ),
    total: settings.servers.length,
  };
}

async function readiness<T>(
  read: () => Promise<T>,
  error: string
): Promise<Readiness<T>> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { error, ok: false };
  }
}
// Authorization runs before all service reads. One unavailable service never hides the others.
export function createOverviewHandler({
  session,
  tools,
  storage,
  model,
  env = process.env,
}: {
  session: () => Promise<{ id?: string; type?: string } | null | undefined>;
  tools: () => Promise<ToolsReadiness>;
  storage: () => Promise<StorageReadiness>;
  model: () => Promise<ModelReadiness>;
  env?: Environment;
}) {
  return async (request: Request) => {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      authorizeManagement(await session(), request, false, env);
      const [toolsResult, storageResult, modelResult] = await Promise.all([
        readiness(tools, "工具配置暂时读取失败。"),
        readiness(storage, "存储配置暂时读取失败。"),
        readiness(model, "模型配置暂时读取失败。"),
      ]);
      const result: AdminOverviewData = {
        model: modelResult,
        storage: storageResult,
        tools: toolsResult,
      };
      return Response.json(result, { headers });
    } catch (error) {
      const status = error instanceof SettingsError ? error.status : 500;
      return Response.json(
        {
          error:
            status === 401
              ? "请先登录。"
              : status === 403
                ? "仅平台管理员可以查看概览。"
                : "概览暂时读取失败。",
        },
        { headers, status }
      );
    }
  };
}
