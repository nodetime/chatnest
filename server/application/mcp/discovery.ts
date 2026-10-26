import "server-only";
import { createMCPClient } from "@ai-sdk/mcp";
import type { Connection, ToolMetadata } from "@/server/domain/mcp/types";
import { abortable, closeManagedClient } from "./lifecycle";
import { listNativeTools } from "./native-tools";
import {
  DISCOVERY_TIMEOUT_MS,
  guardedFetch,
  validateConnection,
} from "./network";
import { type Environment, SettingsError } from "./security";
export async function discoverConnection(
  connection: Connection,
  env: Environment = process.env,
  connect: typeof createMCPClient = createMCPClient,
  externalSignal?: AbortSignal
): Promise<ToolMetadata[]> {
  validateConnection(connection, env);
  const signal = AbortSignal.any([
    AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    ...(externalSignal ? [externalSignal] : []),
  ]);
  let client: Awaited<ReturnType<typeof connect>> | undefined;
  try {
    client = await abortable(
      () =>
        connect({
          maxRetries: 0,
          transport: {
            fetch: guardedFetch(connection, env, signal),
            headers: connection.headers,
            type: "http",
            url: connection.url,
          },
        }),
      signal,
      (late) => {
        closeManagedClient(late).catch(() => undefined);
      }
    );
    const definitions = await listNativeTools(client, signal);
    return definitions.map((remote) => ({
      description: remote.description ?? "",
      name: remote.name,
    }));
  } catch {
    // biome-ignore lint/style/useErrorCause: Remote causes can contain credentials and full sensitive URLs.
    throw new SettingsError(
      502,
      "连接测试失败，请检查地址、凭据与服务状态；成功初始化不代表服务套餐已开通。"
    );
  } finally {
    if (client) {
      await closeManagedClient(client);
    }
  }
}
