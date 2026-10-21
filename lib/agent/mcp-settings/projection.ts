import { resolveServerConnection } from "../config";
import type { RuntimeServer } from "./runtime-config";
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
      tools: server.allowedTools,
    };
  });
}
