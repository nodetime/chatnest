import "server-only";
import type { MCPClient } from "@ai-sdk/mcp";
import type { JSONSchema7 } from "@ai-sdk/provider";
import { jsonSchema } from "ai";
import { abortable } from "@/server/agent/mcp-settings/lifecycle";
import { toolNameSchema } from "@/server/agent/mcp-settings/schema";

type NativeTool = Awaited<ReturnType<MCPClient["listTools"]>>["tools"][number];
export async function listNativeTools(client: MCPClient, signal: AbortSignal) {
  const result = await abortable(
    () => client.listTools({ options: { signal } }),
    signal
  );
  // Bounded MVP catalog: reject pagination instead of silently showing a partial allowlist.
  if (result.nextCursor || result.tools.length > 128) {
    throw new Error("MCP tool catalog exceeds limits");
  }
  const names = new Set<string>();
  let total = 0;
  for (const remote of result.tools) {
    toolNameSchema.parse(remote.name);
    if (names.has(remote.name)) {
      throw new Error("Duplicate MCP tool name");
    }
    names.add(remote.name);
    if ((remote.description?.length ?? 0) > 4096) {
      throw new Error("MCP description is too large");
    }
    const bytes = Buffer.byteLength(JSON.stringify(remote.inputSchema));
    total += bytes + Buffer.byteLength(remote.description ?? "");
    if (bytes > 65_536 || total > 262_144) {
      throw new Error("MCP metadata is too large");
    }
  }
  return result.tools;
}
export function nativeRuntimeTools(
  client: MCPClient,
  definitions: NativeTool[]
) {
  return Object.fromEntries(
    definitions.map((remote) => [
      remote.name,
      {
        description: remote.description,
        execute: (input: unknown, options: { abortSignal?: AbortSignal }) =>
          client.callTool({
            arguments: input as Record<string, unknown>,
            name: remote.name,
            options: { signal: options.abortSignal },
          }),
        inputSchema: jsonSchema(remote.inputSchema as JSONSchema7),
      },
    ])
  );
}
