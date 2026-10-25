import "server-only";
import type { ServerConfig } from "../config";
import { decryptSettings, encryptSettings, parseEncryptionKey } from "./crypto";
import { discoverConnection } from "./discovery";
import { validateConnection } from "./network";
import { type SettingsRepository, settingsRepository } from "./repository";
import { actionSchema, managedListSchema } from "./schema";
import { type Environment, managementReady, SettingsError } from "./security";
import type {
  Connection,
  ConnectionEdit,
  ManagedServer,
  ServerProjection,
  SettingsAction,
} from "./types";
export function publicServer(server: ManagedServer): ServerProjection {
  return {
    allowedTools: server.allowedTools,
    enabled: server.enabled,
    headerNames: Object.keys(server.headers),
    id: server.id,
    name: server.name,
    origin: new URL(server.url).origin,
    source: "managed",
  };
}
export function createSettingsService({
  repository = settingsRepository,
  env = process.env,
  discover = discoverConnection,
}: {
  repository?: SettingsRepository;
  env?: Environment;
  discover?: (
    connection: Connection,
    env: Environment
  ) => ReturnType<typeof discoverConnection>;
} = {}) {
  async function read() {
    const key = parseEncryptionKey(env.MCP_SETTINGS_ENCRYPTION_KEY);
    const row = await repository.read();
    const servers = row
      ? managedListSchema.parse(
          decryptSettings(row.encrypted, row.revision, key)
        )
      : [];
    if (new Set(servers.map((s) => s.id)).size !== servers.length) {
      throw new Error("Duplicate managed MCP IDs");
    }
    return { key, revision: row?.revision ?? 0, servers };
  }
  function resolve(
    edit: ConnectionEdit,
    id: string | undefined,
    servers: ManagedServer[]
  ): Connection {
    if (edit.mode === "replace") {
      return edit.value;
    }
    const previous = servers.find((s) => s.id === id);
    if (!previous) {
      throw new SettingsError(400, "请选择要保留的连接。");
    }
    return { headers: previous.headers, url: previous.url };
  }
  return {
    async get(file: ServerConfig[]) {
      const configured = managementReady(env);
      const state = configured ? await read() : { revision: 0, servers: [] };
      return {
        configured,
        revision: state.revision,
        servers: [
          ...file.map((s) => ({
            allowedTools: s.allowedTools,
            enabled: true,
            headerNames: Object.keys(s.headers),
            id: s.id,
            name: s.name,
            origin: "",
            source: "file" as const,
          })),
          ...state.servers.map(publicServer),
        ],
      };
    },
    async load() {
      if (!managementReady(env)) {
        return [];
      }
      return (await read()).servers;
    },
    async mutate(
      input: SettingsAction,
      updatedBy: string,
      file: ServerConfig[]
    ) {
      if (!managementReady(env)) {
        throw new SettingsError(503, "请先完成服务端 MCP 管理配置。");
      }
      const action = actionSchema.parse(input);
      if (action.action === "test") {
        throw new SettingsError(400, "无效操作。");
      }
      const state = await read();
      if (state.revision !== action.revision) {
        throw new SettingsError(409, "配置已更新，请刷新后重试；输入仍保留。");
      }
      if (
        file.some(
          (s) =>
            s.id === (action.action === "save" ? action.server.id : action.id)
        )
      ) {
        throw new SettingsError(400, "文件管理连接为只读。");
      }
      const servers = [...state.servers];
      if (action.action === "save") {
        const connection = resolve(
          action.server.connection,
          action.server.id,
          servers
        );
        validateConnection(connection, env);
        const tools = await discover(connection, env);
        if (
          action.server.allowedTools.some(
            (name) => !tools.some((tool) => tool.name === name)
          )
        ) {
          throw new SettingsError(400, "选择的工具已变化，请重新测试。");
        }
        const { connection: _, ...data } = action.server;
        const server = { ...connection, ...data };
        const index = servers.findIndex((s) => s.id === server.id);
        if (index < 0) {
          servers.push(server);
        } else {
          servers[index] = server;
        }
      } else {
        const index = servers.findIndex((s) => s.id === action.id);
        if (index < 0) {
          throw new SettingsError(404, "连接不存在。");
        }
        if (action.action === "delete") {
          servers.splice(index, 1);
        } else {
          servers[index] = { ...servers[index], enabled: action.enabled };
        }
      }
      if (file.length + servers.length > 8) {
        throw new SettingsError(400, "最多配置 8 个连接（包含文件管理连接）。");
      }
      managedListSchema.parse(servers);
      const revision = state.revision + 1;
      if (
        !(await repository.compareAndSwap(state.revision, {
          encrypted: encryptSettings(servers, revision, state.key),
          revision,
          updatedAt: new Date(),
          updatedBy,
        }))
      ) {
        throw new SettingsError(409, "配置已更新，请刷新后重试；输入仍保留。");
      }
      return { revision };
    },
    async test(input: unknown) {
      if (!managementReady(env)) {
        throw new SettingsError(503, "请先完成服务端 MCP 管理配置。");
      }
      const action = actionSchema.parse(input);
      if (action.action !== "test") {
        throw new SettingsError(400, "无效操作。");
      }
      const { servers } = await read();
      return {
        tools: await discover(
          resolve(action.connection, action.id, servers),
          env
        ),
      };
    },
  };
}
