import { resolveServerConnection } from "../config";
import { type RuntimeServer, toolAlias } from "./runtime-config";
// Explicit allowlist projection. Never spread a server configuration into a response.
export function capabilityServers(servers: RuntimeServer[]) {
  return servers.map((server) => {
    const { missing, invalid } = resolveServerConnection(server);
    return {
      id: server.id,
      keyless: Object.keys(server.headers).length === 0,
      missingEnvironment: missing,
      name: server.name,
      source: server.managed ? ("managed" as const) : ("file" as const),
      status:
        missing.length || invalid
          ? ("not_configured" as const)
          : ("configured" as const),
      toolAliases: server.allowedTools.map((name) => ({
        alias: toolAlias(server.id, name),
        name,
        serverName: server.name,
      })),
      tools: server.allowedTools,
    };
  });
}
