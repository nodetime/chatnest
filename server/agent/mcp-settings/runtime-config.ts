import "server-only";
import { createHash } from "node:crypto";
import {
  type AgentConfig,
  readAgentConfig,
  type ServerConfig,
} from "@/server/agent/config";
import { createSettingsService } from "@/server/agent/mcp-settings/service";
import type { ManagedServer } from "@/server/agent/mcp-settings/types";
export type RuntimeServer = ServerConfig & { managed?: boolean };
export type RuntimeConfig = Omit<AgentConfig, "servers"> & {
  servers: RuntimeServer[];
};
export function toolAlias(id: string, name: string) {
  const legacy = `${id}__${name}`;
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(legacy)) {
    return legacy;
  }
  const hash = createHash("sha256")
    .update(JSON.stringify([id, name]))
    .digest("hex")
    .slice(0, 24);
  return `${legacy.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 39)}_${hash}`;
}
export function mergeManagedConfig(
  file: AgentConfig,
  managed: ManagedServer[]
): RuntimeConfig {
  const ids = new Set(file.servers.map((s) => s.id));
  if (
    file.servers.length + managed.length > 8 ||
    managed.some((s) => ids.has(s.id) || !ids.add(s.id))
  ) {
    throw new Error("Conflicting MCP configuration");
  }
  return structuredClone({
    ...file,
    servers: [
      ...file.servers,
      ...managed
        .filter((s) => s.enabled)
        .map(({ enabled: _, ...s }) => ({
          ...s,
          autoApproveTools: [],
          managed: true,
        })),
    ],
  });
}
export async function readRuntimeConfig(): Promise<RuntimeConfig> {
  const [file, managed] = await Promise.all([
    readAgentConfig(),
    createSettingsService().load(),
  ]);
  return mergeManagedConfig(file, managed);
}
