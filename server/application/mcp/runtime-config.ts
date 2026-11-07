import "server-only";
import { createHash } from "node:crypto";
import type { ManagedServer } from "@/server/domain/mcp/types";
import {
  type AgentConfig,
  readAgentConfig,
  type ServerConfig,
} from "@/server/infrastructure/mcp/config";
import { createSettingsService } from "./service";
export type RuntimeServer = ServerConfig & {
  managed?: boolean;
  personal?: boolean;
  capabilityId?: string;
  authorizationVersion?: string;
};
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
      ...file.servers.filter((server) => server.enabled !== false),
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

export function runtimeToolAlias(server: RuntimeServer, name: string) {
  return toolAlias(
    server.authorizationVersion
      ? `${server.id}_${server.authorizationVersion.slice(0, 16)}`
      : server.id,
    name
  );
}

/**
 * Billing identity is the provider's stable API path, not the UI alias exposed
 * to the model. Porta's MCP catalog uses snake_case names while its billing
 * contract keeps the documented `onebound/1688/...` identity.
 */
export function canonicalToolKey(server: RuntimeServer, name: string) {
  if (server.id === "porta") {
    const onebound = /^onebound_(\d+)_(.+)$/.exec(name);
    if (onebound) {
      return `onebound/${onebound[1]}/${onebound[2]}`;
    }
  }
  return `${server.id}/${name}`;
}
